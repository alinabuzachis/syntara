import { createFieldHelp } from '../../components/createFieldHelp'

import * as T from './groupFieldHelpText'

/** Pre-built labelHelp elements for group forms. */
export const groupHelp = {
  name: createFieldHelp('Group name', T.GROUP_NAME_HELP),
} as const
