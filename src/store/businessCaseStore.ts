// src/store/businessCaseStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  BUSINESS_CASE_SECTION_IDS,
  createDefaultBusinessCaseDraft,
  type BusinessCaseDraft,
  type BusinessCaseSectionId,
  type ThemeSelectionKey,
} from '@/lib/persistence/project-state';

export const THEMES = [
  { key: 'growth', label: 'Population & employment growth pressure' },
  { key: 'congestion', label: 'Congestion / travel time reliability' },
  { key: 'car-dependency', label: 'Car dependency / lack of alternatives' },
  { key: 'economy', label: 'Access to jobs / economic centres' },
  { key: 'freight', label: 'Freight / logistics network gaps' },
] as const;

export type ThemeKey = ThemeSelectionKey;

// Sections 'scene', 'gap', 'evidence' are always included (non-toggleable).
// Sections 'growth', 'car-dependency', 'congestion', 'economy' are theme-driven.
export const SECTION_IDS = BUSINESS_CASE_SECTION_IDS;
export type SectionId = BusinessCaseSectionId;

interface BusinessCaseState extends BusinessCaseDraft {
  setProject: (update: Partial<BusinessCaseDraft>) => void;
  replaceDraft: (draft: BusinessCaseDraft) => void;
  toggleSection: (id: SectionId) => void;
  clearProject: () => void;
}

function getInitialState(): BusinessCaseDraft {
  return createDefaultBusinessCaseDraft();
}

export const useBusinessCaseStore = create<BusinessCaseState>()(
  persist(
    (set) => ({
      ...getInitialState(),

      setProject: (update) => set((state) => ({ ...state, ...update })),

      replaceDraft: (draft) => set({ ...draft }),

      toggleSection: (id) =>
        set((state) => ({
          sectionToggles: {
            ...state.sectionToggles,
            [id]: !state.sectionToggles[id],
          },
        })),

      clearProject: () => set(getInitialState()),
    }),
    {
      name: 'business-case-store',
      // Load from localStorage explicitly (via useHasHydrated) instead of at
      // store-creation time, so the server render and the client's first
      // paint both see the same un-hydrated defaults — avoids a hydration
      // mismatch on pages that branch on this store's state (e.g. wizardOpen
      // in business-case/page.tsx).
      skipHydration: true,
      partialize: (state) => ({
        projectName: state.projectName,
        projectType: state.projectType,
        areaIds: state.areaIds,
        themes: state.themes,
        sectionToggles: state.sectionToggles,
      }),
    }
  )
);
