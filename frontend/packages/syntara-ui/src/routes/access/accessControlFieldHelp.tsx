import { createFieldHelp } from '../../components/createFieldHelp'

import * as T from './accessControlFieldHelpText'

/** Pre-built labelHelp elements for access control diagnostic forms. */
export const accessControlHelp = {
  resourceType: createFieldHelp('Resource type', T.RESOURCE_TYPE_HELP),
  action: createFieldHelp('Action', T.ACTION_HELP),
  project: createFieldHelp('Project', T.PROJECT_HELP),
  resourceId: createFieldHelp('Resource ID', T.RESOURCE_ID_HELP),
} as const
