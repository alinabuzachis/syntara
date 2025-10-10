import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export function createCrud<T extends { id: number }>(name: string, defaultResources: T[]) {
  return create<{
    resources: T[]
    addResource: (integration: Omit<T, 'id'>) => void
    editResource: (id: number, integration: Partial<T>) => void
    deleteResource: (id: number) => void
  }>()(
    persist(
      (set) => ({
        resources: defaultResources,
        addResource: (resource) =>
          set((state) => ({
            resources: [
              ...state.resources,
              {
                ...resource,
                id: Math.max(0, ...state.resources.map((i) => i.id)) + 1,
              } as T,
            ],
          })),
        editResource: (id, updates) =>
          set((state) => ({
            resources: state.resources.map((i) => (i.id === id ? { ...i, ...updates } : i)),
          })),
        deleteResource: (id) =>
          set((state) => ({
            resources: state.resources.filter((i) => i.id !== id),
          })),
      }),
      { name }
    )
  )
}
