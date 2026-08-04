import { createFieldHelp } from '../../components/createFieldHelp'

import * as T from './accessControlFieldHelpText'

/** Pre-built labelHelp elements for access control forms. */
export const accessControlHelp = {
  resourceType: createFieldHelp('Resource type', T.RESOURCE_TYPE_HELP),
  action: createFieldHelp('Action', T.ACTION_HELP),
  project: createFieldHelp('Project', T.PROJECT_HELP),
  resourceId: createFieldHelp('Resource ID', T.RESOURCE_ID_HELP),
  scope: createFieldHelp('Scope', T.SCOPE_HELP),
  policies: createFieldHelp('Policies', T.POLICIES_HELP),
  principalType: createFieldHelp('Principal type', T.PRINCIPAL_TYPE_HELP),
  role: createFieldHelp('Role', T.ROLE_HELP),
} as const
