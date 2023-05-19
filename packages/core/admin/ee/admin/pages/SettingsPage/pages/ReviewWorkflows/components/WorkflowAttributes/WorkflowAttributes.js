import * as React from 'react';
import PropTypes from 'prop-types';
import { useField } from 'formik';
import { useIntl } from 'react-intl';
import { useDispatch } from 'react-redux';
import { Grid, GridItem, MultiSelectNested, TextInput } from '@strapi/design-system';

import { updateWorkflow } from '../../actions';

export function WorkflowAttributes({ contentTypes: { collectionTypes, singleTypes } }) {
  const { formatMessage } = useIntl();
  const dispatch = useDispatch();
  const [nameField, nameMeta] = useField('name');
  const [contentTypesField, contentTypesMeta] = useField('contentTypes');

  return (
    <Grid background="neutral0" hasRadius gap={4} padding={6} shadow="tableShadow">
      <GridItem col={6}>
        <TextInput
          {...nameField}
          id={nameField.name}
          label={formatMessage({
            id: 'Settings.review-workflows.workflow.name.label',
            defaultMessage: 'Workflow Name',
          })}
          error={nameMeta.error ?? false}
          onChange={(event) => {
            dispatch(updateWorkflow({ name: event.target.value }));
            nameField.onChange(event);
          }}
          required
        />
      </GridItem>

      <GridItem col={6}>
        <MultiSelectNested
          {...contentTypesField}
          customizeContent={(value) =>
            formatMessage(
              {
                id: 'Settings.review-workflows.workflow.contentTypes.displayValue',
                defaultMessage:
                  '{count} {count, plural, one {content type} other {content types}} selected',
              },
              { count: value.length }
            )
          }
          error={contentTypesMeta.error ?? false}
          id={contentTypesField.name}
          label={formatMessage({
            id: 'Settings.review-workflows.workflow.contentTypes.label',
            defaultMessage: 'Associated to',
          })}
          onChange={(values) => {
            dispatch(updateWorkflow({ contentTypes: values }));
            contentTypesField.onChange({ target: { value: values } });
          }}
          options={[
            {
              label: formatMessage({
                id: 'Settings.review-workflows.workflow.contentTypes.collectionTypes.label',
                defaultMessage: 'Collection Types',
              }),
              children: collectionTypes.map((contentType) => ({
                label: contentType.info.displayName,
                value: contentType.uid,
              })),
            },

            {
              label: formatMessage({
                id: 'Settings.review-workflows.workflow.contentTypes.singleTypes.label',
                defaultMessage: 'Single Types',
              }),
              children: singleTypes.map((contentType) => ({
                label: contentType.info.displayName,
                value: contentType.uid,
              })),
            },
          ]}
          placeholder={formatMessage({
            id: 'Settings.review-workflows.workflow.contentTypes.placeholder',
            defaultMessage: 'Select',
          })}
          required
        />
      </GridItem>
    </Grid>
  );
}

const ContentTypeType = PropTypes.shape({
  uid: PropTypes.string.isRequired,
  info: PropTypes.shape({
    displayName: PropTypes.string.isRequired,
  }).isRequired,
});

WorkflowAttributes.propTypes = {
  contentTypes: PropTypes.shape({
    collectionTypes: PropTypes.arrayOf(ContentTypeType).isRequired,
    singleTypes: PropTypes.arrayOf(ContentTypeType).isRequired,
  }).isRequired,
};