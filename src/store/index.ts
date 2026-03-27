'use client';

import { create } from 'zustand';
import type { Area, DataCategory } from '@/types';

interface AppState {
  // Selected areas
  selectedArea: Area | null;
  comparisonAreas: Area[];
  benchmarkArea: Area | null;

  // Filters
  selectedYear: number;
  selectedCategory: DataCategory;
  areaType: Area['type'];

  // UI state
  sidebarOpen: boolean;
  mapLayerVisible: boolean;

  // Actions
  setSelectedArea: (area: Area | null) => void;
  addComparisonArea: (area: Area) => void;
  removeComparisonArea: (areaId: string) => void;
  clearComparisonAreas: () => void;
  setBenchmarkArea: (area: Area | null) => void;
  setSelectedYear: (year: number) => void;
  setSelectedCategory: (category: DataCategory) => void;
  setAreaType: (type: Area['type']) => void;
  toggleSidebar: () => void;
  toggleMapLayer: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedArea: { id: 'lga_sydney', name: 'City of Sydney', type: 'lga' },
  comparisonAreas: [],
  benchmarkArea: null,
  selectedYear: 2021,
  selectedCategory: 'demographics',
  areaType: 'lga',
  sidebarOpen: true,
  mapLayerVisible: true,

  setSelectedArea: (area) => set({ selectedArea: area }),
  addComparisonArea: (area) =>
    set((state) => ({
      comparisonAreas: state.comparisonAreas.find((a) => a.id === area.id)
        ? state.comparisonAreas
        : [...state.comparisonAreas, area],
    })),
  removeComparisonArea: (areaId) =>
    set((state) => ({
      comparisonAreas: state.comparisonAreas.filter((a) => a.id !== areaId),
    })),
  clearComparisonAreas: () => set({ comparisonAreas: [] }),
  setBenchmarkArea: (area) => set({ benchmarkArea: area }),
  setSelectedYear: (year) => set({ selectedYear: year }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setAreaType: (type) => set({ areaType: type }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleMapLayer: () =>
    set((state) => ({ mapLayerVisible: !state.mapLayerVisible })),
}));
