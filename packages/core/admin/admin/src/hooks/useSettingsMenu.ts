import * as React from 'react';

import {
  hasPermissions,
  StrapiAppSetting,
  StrapiAppSettingLink,
  useRBACProvider,
  useStrapiApp,
  useAppInfo,
} from '@strapi/helper-plugin';
import sortBy from 'lodash/sortBy';
import { useSelector } from 'react-redux';

import { SETTINGS_LINKS_CE } from '../constants';
import { selectAdminPermissions } from '../selectors';

import { useEnterprise } from './useEnterprise';

interface SettingsMenuLinkExtended extends StrapiAppSettingLink {
  hasNotification: boolean;
  isDisplayed: boolean;
}

interface StrapiAppSettingExtended extends StrapiAppSetting {
  links: SettingsMenuLinkExtended[];
}

const formatLinks = (menu: StrapiAppSettingExtended[]): SettingsMenuLinkExtended[] =>
  menu.map((menuSection) => {
    const formattedLinks = menuSection.links.map((link) => ({
      ...link,
      isDisplayed: false,
    }));

    return { ...menuSection, links: formattedLinks };
  });

export const useSettingsMenu = () => {
  const [{ isLoading, menu }, setData] = React.useState<{
    isLoading: boolean;
    menu: StrapiAppSettingExtended[];
  }>({
    isLoading: true,
    menu: [],
  });
  const { allPermissions: userPermissions } = useRBACProvider();
  const { shouldUpdateStrapi } = useAppInfo();
  const { settings } = useStrapiApp();
  const permissions = useSelector(selectAdminPermissions);

  const { global: globalLinks, admin: adminLinks } = useEnterprise(
    SETTINGS_LINKS_CE,
    async () => (await import('../../../ee/admin/src/constants')).SETTINGS_LINKS_EE,
    {
      combine(getCeLinks, getEeLinks) {
        const ceLinks = getCeLinks();
        const eeLinks = getEeLinks();

        return {
          admin: [...eeLinks.admin, ...ceLinks.admin],
          global: [...ceLinks.global, ...eeLinks.global],
        };
      },
      defaultValue: {
        admin: [],
        global: [],
      },
    }
  );

  const addPermissions = React.useCallback(
    (link) => {
      if (!link.id) {
        throw new Error('The settings menu item must have an id attribute.');
      }

      return {
        ...link,
        permissions: permissions.settings?.[link.id]?.main,
      };
    },
    [permissions.settings]
  );

  React.useEffect(() => {
    const getData = async () => {
      const buildMenuPermissions = (sections) =>
        Promise.all(
          sections.reduce((acc, section, sectionIndex) => {
            const buildMenuPermissions = (links) =>
              links.map(async (link, linkIndex) => ({
                hasPermission: await hasPermissions(userPermissions, link.permissions),
                sectionIndex,
                linkIndex,
              }));

            return [...acc, ...buildMenuPermissions(section.links)];
          }, [])
        );

      const menuPermissions = await buildMenuPermissions(sections);

      setData((prev) => ({
        ...prev,
        isLoading: false,
        menu: sections.map((section, sectionIndex) => ({
          ...section,
          links: section.links.map((link, linkIndex) => {
            const permission = menuPermissions.find(
              (permission) =>
                permission.sectionIndex === sectionIndex && permission.linkIndex === linkIndex
            );

            return {
              ...link,
              isDisplayed: Boolean(permission.hasPermission),
            };
          }),
        })),
      }));
    };

    const { global, ...otherSections } = settings;
    const sections = formatLinks([
      {
        ...settings.global,
        links: sortBy(
          [...settings.global.links, ...globalLinks.map(addPermissions)],
          (link) => link.id
        ).map((link) => ({
          ...link,
          hasNotification: link.id === '000-application-infos' && shouldUpdateStrapi,
        })),
      },
      {
        id: 'permissions',
        intlLabel: { id: 'Settings.permissions', defaultMessage: 'Administration Panel' },
        links: adminLinks.map(addPermissions),
      },
      ...Object.values(otherSections),
    ]);

    getData();
  }, [adminLinks, globalLinks, userPermissions, settings, shouldUpdateStrapi, addPermissions]);

  return {
    isLoading,
    menu: menu.map((menuItem) => ({
      ...menuItem,
      links: menuItem.links.filter((link) => link.isDisplayed),
    })),
  };
};
