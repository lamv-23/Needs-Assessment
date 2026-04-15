/**
 * Zustand store for NSW Population & Employment Projections
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createDefaultProjectionUploadDraft,
  type ProjectionUploadDraft,
} from '@/lib/persistence/project-state';
import type { PopulationProjection, ProjectionDataSet } from '@/lib/excel-parser';

interface ProjectionStore extends ProjectionUploadDraft {
  // State
  isImporting: boolean;
  importError: string | null;

  // Actions
  replaceDraft: (draft: ProjectionUploadDraft) => void;
  setProjections: (projections: PopulationProjection[], metadata: ProjectionDataSet) => void;
  clearProjections: () => void;
  setImporting: (isImporting: boolean) => void;
  setImportError: (error: string | null) => void;

  // Getters
  getProjectionForLGA: (lgaId: string, year: number) => PopulationProjection | undefined;
  getProjectionsForLGA: (lgaId: string) => PopulationProjection[];
  hasProjectionData: () => boolean;
  getAvailableYears: () => number[];
}

function getInitialState(): ProjectionUploadDraft {
  return createDefaultProjectionUploadDraft();
}

export const useProjectionStore = create<ProjectionStore>()(
  persist(
    (set, get) => ({
      ...getInitialState(),
      isImporting: false,
      importError: null,

      replaceDraft: (draft) => {
        set({
          ...draft,
          importError: null,
        });
      },

      setProjections: (projections, metadata) => {
        set({
          populationProjections: projections,
          projectionMetadata: metadata,
          importError: null,
        });
      },

      clearProjections: () => {
        set({
          ...getInitialState(),
          importError: null,
        });
      },

      setImporting: (isImporting) => {
        set({ isImporting });
      },

      setImportError: (error) => {
        set({ importError: error });
      },

      getProjectionForLGA: (lgaId: string, year: number) => {
        const projections = get().populationProjections;
        return projections.find((p) => p.lgaName === lgaId && p.year === year);
      },

      getProjectionsForLGA: (lgaId: string) => {
        const projections = get().populationProjections;
        return projections
          .filter((p) => p.lgaName === lgaId)
          .sort((a, b) => a.year - b.year);
      },

      hasProjectionData: () => {
        return get().populationProjections.length > 0;
      },

      getAvailableYears: () => {
        const projections = get().populationProjections;
        const years = new Set(projections.map((p) => p.year));
        return Array.from(years).sort((a, b) => a - b);
      },
    }),
    {
      name: 'projection-store',
      partialize: (state) => ({
        populationProjections: state.populationProjections,
        projectionMetadata: state.projectionMetadata,
      }),
    }
  )
);
