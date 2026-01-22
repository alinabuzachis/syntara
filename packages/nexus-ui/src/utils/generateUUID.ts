import { v4 as generateUUID } from 'uuid'

export { generateUUID }

export const generateActivityId = (prefix = 'activity') => `${prefix}_${generateUUID().replace(/-/g, '_')}`
