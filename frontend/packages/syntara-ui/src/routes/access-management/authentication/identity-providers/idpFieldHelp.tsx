import { createFieldHelp } from '../../../../components/createFieldHelp'

import * as T from './idpFieldHelpText'

/** Pre-built labelHelp elements for identity provider forms. */
export const idpHelp = {
  providerTemplate: createFieldHelp('Provider template', T.PROVIDER_TEMPLATE_HELP),
  subjectClaim: createFieldHelp('Subject claim', T.SUBJECT_CLAIM_HELP),
  emailClaim: createFieldHelp('Email claim', T.EMAIL_CLAIM_HELP),
  groupExtractionExpression: createFieldHelp('Group extraction expression', T.GROUP_EXTRACTION_EXPRESSION_HELP),
  idpGroupValue: createFieldHelp('IdP group value', T.IDP_GROUP_VALUE_HELP),
  /** Popover title stays "Group" even when the column header uses APP_TITLE. */
  group: createFieldHelp('Group', T.GROUP_HELP),
} as const
