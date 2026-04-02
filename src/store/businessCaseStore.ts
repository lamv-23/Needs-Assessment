// src/store/businessCaseStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const THEMES = [
  { key: 'growth', label: 'Population & employment growth pressure' },
  { key: 'congestion', label: 'Congestion / travel time reliability' },
  { key: 'car-dependency', label: 'Car dependency / lack of alternatives' },
  { key: 'economy', label: 'Access to jobs / economic centres' },
  { key: 'freight', label: 'Freight / logistics network gaps' },
] as const;

export type ThemeKey = typeof THEMES[number]['key'];

// Sections 'scene', 'gap', 'evidence' are always included (non-toggleable).
// Sections 'growth', 'car-dependency', 'congestion', 'economy' are theme-driven.
export const SECTION_IDS = ['scene', 'growth', 'car-dependency', 'congestion', 'economy', 'gap', 'evidence'] as const;
export type SectionId = typeof SECTION_IDS[number];

const DEFAULT_TOGGLES: Record<SectionId, boolean> = {
  scene: true,
  growth: true,
  'car-dependency': true,
  congestion: true,
  economy: true,
  gap: true,
  evidence: true,
};

interface BusinessCaseState {
  projectName: string;
  projectType: 'road' | null;
  areaIds: string[];
  themes: ThemeKey[];
  sectionToggles: Record<SectionId, boolean>;
  setProject: (update: Partial<Pick<BusinessCaseState, 'projectName' | 'projectType' | 'areaIds' | 'themes' | 'sectionToggles'>>) => void;
  toggleSection: (id: SectionId) => void;
  clearProject: () => void;
}

export const useBusinessCaseStore = create<BusinessCaseState>()(
  persist(
    (set, get) => ({
      projectName: '',
      projectType: null,
      areaIds: [],
      themes: THEMES.map(t => t.key),
      sectionToggles: { ...DEFAULT_TOGGLES },

      setProject: (update) => set((state) => ({ ...state, ...update })),

      toggleSection: (id) =>
        set((state) => ({
          sectionToggles: {
            ...state.sectionToggles,
            [id]: !state.sectionToggles[id],
          },
        })),

      clearProject: () =>
        set({
          projectName: '',
          projectType: null,
          areaIds: [],
          themes: THEMES.map(t => t.key),
          sectionToggles: { ...DEFAULT_TOGGLES },
        }),
    }),
    {
      name: 'business-case-store',
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
