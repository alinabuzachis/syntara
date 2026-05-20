import { useEffect, useState } from 'react'

import { detachPromise } from '../../../utils/detachPromise'
import { accessFetchClient } from '../../access/accessClient'

type SettingsPermissions = {
  canRead: boolean
  canWrite: boolean
}

const defaults: SettingsPermissions = { canRead: false, canWrite: false }

export function useSettingsPermissions(): SettingsPermissions {
  const [permissions, setPermissions] = useState<SettingsPermissions>(defaults)

  useEffect(() => {
    let cancelled = false

    detachPromise(
      Promise.all([
        accessFetchClient.POST('/authz/can_i', {
          body: { action: 'read', resource_type: 'setting' },
        }),
        accessFetchClient.POST('/authz/can_i', {
          body: { action: 'write', resource_type: 'setting' },
        }),
      ])
        .then(([readResult, writeResult]) => {
          if (!cancelled) {
            setPermissions({
              canRead: readResult.data?.allowed === true,
              canWrite: writeResult.data?.allowed === true,
            })
          }
        })
        .catch(() => {
          // Leave permissions at safe defaults (canRead: false, canWrite: false)
        })
    )

    return () => {
      cancelled = true
    }
  }, [])

  return permissions
}
