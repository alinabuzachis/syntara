import { generateActivityId } from '../../../utils/generateUUID'

import { getNodeDisplayName } from './nodeNaming'

export function buildNamedActivity<TActivity>(
  baseName: string,
  requestedName: string | undefined,
  buildActivity: (activityId: string, name: string) => TActivity
): { activityId: string; name: string; activity: TActivity } {
  const activityId = generateActivityId()
  const name = getNodeDisplayName(baseName, requestedName)
  const activity = buildActivity(activityId, name)

  return { activityId, name, activity }
}

export function buildNamedTrigger<TTrigger>(
  baseName: string,
  requestedName: string | undefined,
  buildTrigger: (name: string) => TTrigger
): { name: string; trigger: TTrigger } {
  const name = getNodeDisplayName(baseName, requestedName)
  const trigger = buildTrigger(name)

  return { name, trigger }
}
