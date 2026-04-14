import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createDefaultStrategicAlignmentDraft,
  type StrategicAlignmentDraft,
} from '@/lib/persistence/project-state';

interface StrategicAlignmentState extends StrategicAlignmentDraft {
  replaceDraft: (draft: StrategicAlignmentDraft) => void;
  toggleStrategy: (id: string) => void;
  setStrategyNote: (id: string, note: string) => void;
  togglePriority: (code: StrategicAlignmentDraft['selectedPriorities'][number]) => void;
  setPriorityNote: (
    code: StrategicAlignmentDraft['selectedPriorities'][number],
    note: string
  ) => void;
  clearAll: () => void;
}

function getInitialState(): StrategicAlignmentDraft {
  return createDefaultStrategicAlignmentDraft();
}

export const useStrategicAlignmentStore = create<StrategicAlignmentState>()(
  persist(
    (set) => ({
      ...getInitialState(),
      replaceDraft: (draft) => set({ ...draft }),
      toggleStrategy: (id) =>
        set((state) => ({
          selectedStrategyIds: state.selectedStrategyIds.includes(id)
            ? state.selectedStrategyIds.filter((existing) => existing !== id)
            : [...state.selectedStrategyIds, id],
        })),
      setStrategyNote: (id, note) =>
        set((state) => ({
          strategyNotes: {
            ...state.strategyNotes,
            [id]: note,
          },
        })),
      togglePriority: (code) =>
        set((state) => ({
          selectedPriorities: state.selectedPriorities.includes(code)
            ? state.selectedPriorities.filter((existing) => existing !== code)
            : [...state.selectedPriorities, code],
        })),
      setPriorityNote: (code, note) =>
        set((state) => ({
          priorityNotes: {
            ...state.priorityNotes,
            [code]: note,
          },
        })),
      clearAll: () => set(getInitialState()),
    }),
    {
      name: 'strategic-alignment-store',
      partialize: (state) => ({
        selectedStrategyIds: state.selectedStrategyIds,
        strategyNotes: state.strategyNotes,
        selectedPriorities: state.selectedPriorities,
        priorityNotes: state.priorityNotes,
      }),
    }
  )
);
