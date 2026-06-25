import { useMemo, useState } from 'react'

type SelectableItem = {
  id: string
  enabled?: boolean
}

export function useToolSelection<T extends SelectableItem>(allItems: T[], filteredItems: T[]) {
  const serverEnabledIds = useMemo(() => new Set(allItems.filter((t) => t.enabled).map((t) => t.id)), [allItems])
  const serverKey = useMemo(() => [...serverEnabledIds].sort().join(','), [serverEnabledIds])

  const [localState, setLocalState] = useState<{ key: string; ids: Set<string> }>({
    key: serverKey,
    ids: new Set(serverEnabledIds),
  })

  const enabledToolIds = localState.key === serverKey ? localState.ids : serverEnabledIds

  // Sync local state when server data changes (React-approved setState-during-render pattern)
  if (localState.key !== serverKey) {
    setLocalState({ key: serverKey, ids: new Set(serverEnabledIds) })
  }

  const enabledCount = allItems.filter((t) => enabledToolIds.has(t.id)).length
  const allSelected = filteredItems.length > 0 && filteredItems.every((t) => enabledToolIds.has(t.id))

  const isDirty = useMemo(() => {
    if (serverEnabledIds.size !== enabledToolIds.size) return true
    for (const id of enabledToolIds) {
      if (!serverEnabledIds.has(id)) return true
    }
    return false
  }, [serverEnabledIds, enabledToolIds])

  function handleSelectAll(checked: boolean) {
    setLocalState((prev) => {
      const updated = new Set(prev.ids)
      for (const item of filteredItems) {
        if (checked) updated.add(item.id)
        else updated.delete(item.id)
      }
      return { key: prev.key, ids: updated }
    })
  }

  function handleSelectTool(toolId: string, checked: boolean) {
    setLocalState((prev) => {
      const updated = new Set(prev.ids)
      if (checked) updated.add(toolId)
      else updated.delete(toolId)
      return { key: prev.key, ids: updated }
    })
  }

  function resetToServer() {
    setLocalState({ key: serverKey, ids: new Set(serverEnabledIds) })
  }

  return {
    enabledToolIds,
    enabledCount,
    allSelected,
    isDirty,
    handleSelectAll,
    handleSelectTool,
    resetToServer,
  }
}
