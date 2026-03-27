/**
 * Zustand store for NSW Population & Employment Projections
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PopulationProjection, ProjectionDataSet } from '@/lib/excel-parser';

interface ProjectionStore {
  // State
  populationProjections: PopulationProjection[];
  projectionMetadata: ProjectionDataSet | null;
  isImporting: boolean;
  importError: string | null;

  // Actions
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

export const useProjectionStore = create<ProjectionStore>()(
  persist(
    (set, get) => ({
      populationProjections: [],
      projectionMetadata: null,
      isImporting: false,
      importError: null,

      setProjections: (projections, metadata) => {
        set({
          populationProjections: projections,
          projectionMetadata: metadata,
          importError: null,
        });
      },

      clearProjections: () => {
        set({
          populationProjections: [],
          projectionMetadata: null,
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
