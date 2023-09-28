import path from 'path';
import type { UID } from '@strapi/types';
import _ from 'lodash';
import pluralize from 'pluralize';

import { nameToSlug, nameToCollectionName, errors } from '@strapi/utils';
import { isConfigurable } from '../../utils/attributes';
import createSchemaHandler, { Infos } from './schema-handler';

const { ApplicationError } = errors;

type CreateComponentOptions = {
  category: string;
  displayName: string;
};

export default function createComponentBuilder() {
  return {
    createComponentUID({ category, displayName }: CreateComponentOptions) {
      return `${nameToSlug(category)}.${nameToSlug(displayName)}`;
    },

    createNewComponentUIDMap(components: object[]) {
      return components.reduce((uidMap: any, component: any) => {
        uidMap[component.tmpUID] = this.createComponentUID(component);
        return uidMap;
      }, {});
    },

    /**
     * create a component in the tmpComponent map
     */
    createComponent(infos: CreateComponentOptions) {
      const uid = this.createComponentUID(infos);

      if (this.components.has(uid)) {
        throw new ApplicationError('component.alreadyExists');
      }

      const handler = createSchemaHandler({
        dir: path.join(strapi.dirs.app.components, nameToSlug(infos.category)),
        filename: `${nameToSlug(infos.displayName)}.json`,
      });

      const collectionName = `components_${nameToCollectionName(
        infos.category
      )}_${nameToCollectionName(pluralize(infos.displayName))}`;

      handler
        .setUID(uid)
        .set('collectionName', collectionName)
        .set(['info', 'displayName'], infos.displayName)
        .set(['info', 'icon'], infos.icon)
        .set(['info', 'description'], infos.description)
        .set('pluginOptions', infos.pluginOptions)
        .set('config', infos.config)
        .setAttributes(this.convertAttributes(infos.attributes));

      if (this.components.size === 0) {
        strapi.telemetry.send('didCreateFirstComponent');
      } else {
        strapi.telemetry.send('didCreateComponent');
      }

      this.components.set(uid, handler);

      return handler;
    },

    /**
     * create a component in the tmpComponent map
     */
    editComponent(infos: Infos): void {
      const { uid } = infos;

      if (!this.components.has(uid)) {
        throw new errors.ApplicationError('component.notFound');
      }

      const component = this.components.get(uid);

      const [, nameUID] = uid.split('.');

      const newCategory = nameToSlug(infos.category);
      const newUID = `${newCategory}.${nameUID}`;

      if (newUID !== uid && this.components.has(newUID)) {
        throw new errors.ApplicationError('component.edit.alreadyExists');
      }

      const newDir = path.join(strapi.dirs.app.components, newCategory);

      const oldAttributes = component.schema.attributes;

      const newAttributes = _.omitBy(infos.attributes, (attr, key) => {
        return _.has(oldAttributes, key) && !isConfigurable(oldAttributes[key]);
      });

      component
        .setUID(newUID)
        .setDir(newDir)
        .set(['info', 'displayName'], infos.displayName)
        .set(['info', 'icon'], infos.icon)
        .set(['info', 'description'], infos.description)
        .set('pluginOptions', infos.pluginOptions)
        .setAttributes(this.convertAttributes(newAttributes));

      if (newUID !== uid) {
        this.components.forEach((compo) => {
          compo.updateComponent(uid, newUID);
        });

        this.contentTypes.forEach((ct) => {
          ct.updateComponent(uid, newUID);
        });
      }

      return component;
    },

    deleteComponent(uid: UID.Component) {
      if (!this.components.has(uid)) {
        throw new errors.ApplicationError('component.notFound');
      }

      this.components.forEach((compo) => {
        compo.removeComponent(uid);
      });

      this.contentTypes.forEach((ct) => {
        ct.removeComponent(uid);
      });

      return this.components.get(uid).delete();
    },
  };
}