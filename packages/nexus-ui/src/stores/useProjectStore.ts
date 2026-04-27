import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ProjectState = {
  /** The currently selected project ID, or null for no selection. */
  selectedProjectId: string | null
  /** Set the selected project ID. Pass null to clear. */
  setSelectedProjectId: (projectId: string | null) => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      setSelectedProjectId: (projectId) => set({ selectedProjectId: projectId }),
    }),
    { name: 'nexus-selected-project' }
  )
)
