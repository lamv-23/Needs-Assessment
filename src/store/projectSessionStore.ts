import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ProjectSyncStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

interface ProjectSessionState {
  currentProjectId: string | null;
  syncStatus: ProjectSyncStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  setCurrentProjectId: (projectId: string | null) => void;
  setSyncState: (update: Partial<Pick<ProjectSessionState, 'syncStatus' | 'syncError' | 'lastSyncedAt'>>) => void;
  clearProjectSession: () => void;
}

export const useProjectSessionStore = create<ProjectSessionState>()(
  persist(
    (set) => ({
      currentProjectId: null,
      syncStatus: 'idle',
      syncError: null,
      lastSyncedAt: null,
      setCurrentProjectId: (projectId) =>
        set((state) => (
          state.currentProjectId === projectId ? state : { currentProjectId: projectId }
        )),
      setSyncState: (update) =>
        set((state) => {
          const next = {
            syncStatus: update.syncStatus ?? state.syncStatus,
            syncError: update.syncError ?? state.syncError,
            lastSyncedAt: update.lastSyncedAt ?? state.lastSyncedAt,
          };

          if (
            state.syncStatus === next.syncStatus
            && state.syncError === next.syncError
            && state.lastSyncedAt === next.lastSyncedAt
          ) {
            return state;
          }

          return { ...state, ...next };
        }),
      clearProjectSession: () =>
        set({
          currentProjectId: null,
          syncStatus: 'idle',
          syncError: null,
          lastSyncedAt: null,
        }),
    }),
    {
      name: 'project-session-store',
      partialize: (state) => ({
        currentProjectId: state.currentProjectId,
      }),
    }
  )
);
