'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type {
  BusinessCaseDraft,
  ProjectionUploadDraft,
  StrategicAlignmentDraft,
} from '@/lib/persistence/project-state';
import { useBusinessCaseStore } from '@/store/businessCaseStore';
import { useProjectionStore } from '@/store/projectionStore';
import { useStrategicAlignmentStore } from '@/store/strategicAlignmentStore';
import { useProjectSessionStore } from '@/store/projectSessionStore';

interface SavedProjectSummary {
  projectId: string;
  ownerId: string;
  name: string;
  projectType: 'road' | null;
  areaIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface SavedProjectResponse {
  project: {
    projectId: string;
    ownerId: string;
    name: string;
    areaIds: string[];
    drafts: {
      businessCase: { payload: BusinessCaseDraft } | null;
      strategicAlignment: { payload: StrategicAlignmentDraft } | null;
      projectionUpload: { payload: ProjectionUploadDraft } | null;
    };
  };
}

function buildSnapshot(
  businessCase: BusinessCaseDraft,
  strategicAlignment: StrategicAlignmentDraft,
  projectionUpload: ProjectionUploadDraft
) {
  return {
    name: businessCase.projectName,
    projectType: businessCase.projectType,
    areaIds: businessCase.areaIds,
    businessCaseDraft: businessCase,
    strategicAlignmentDraft: strategicAlignment,
    projectionUploadDraft: projectionUpload,
  };
}

export function useProjectSync() {
  const businessCase = useBusinessCaseStore(
    useShallow((state) => ({
      projectName: state.projectName,
      projectType: state.projectType,
      areaIds: state.areaIds,
      themes: state.themes,
      sectionToggles: state.sectionToggles,
    }))
  );
  const replaceBusinessCaseDraft = useBusinessCaseStore((state) => state.replaceDraft);
  const strategicAlignment = useStrategicAlignmentStore(
    useShallow((state) => ({
      selectedStrategyIds: state.selectedStrategyIds,
      strategyNotes: state.strategyNotes,
      selectedPriorities: state.selectedPriorities,
      priorityNotes: state.priorityNotes,
    }))
  );
  const replaceStrategicAlignmentDraft = useStrategicAlignmentStore((state) => state.replaceDraft);
  const projectionUpload = useProjectionStore(
    useShallow((state) => ({
      populationProjections: state.populationProjections,
      projectionMetadata: state.projectionMetadata,
    }))
  );
  const replaceProjectionUploadDraft = useProjectionStore((state) => state.replaceDraft);
  const {
    currentProjectId,
    syncStatus,
    syncError,
    lastSyncedAt,
    setCurrentProjectId,
    setSyncState,
  } = useProjectSessionStore();

  const snapshot = useMemo(
    () =>
      buildSnapshot(
        {
          projectName: businessCase.projectName,
          projectType: businessCase.projectType,
          areaIds: businessCase.areaIds,
          themes: businessCase.themes,
          sectionToggles: businessCase.sectionToggles,
        },
        {
          selectedStrategyIds: strategicAlignment.selectedStrategyIds,
          strategyNotes: strategicAlignment.strategyNotes,
          selectedPriorities: strategicAlignment.selectedPriorities,
          priorityNotes: strategicAlignment.priorityNotes,
        },
        {
          populationProjections: projectionUpload.populationProjections,
          projectionMetadata: projectionUpload.projectionMetadata,
        }
      ),
    [
      businessCase.areaIds,
      businessCase.projectName,
      businessCase.projectType,
      businessCase.sectionToggles,
      businessCase.themes,
      projectionUpload.populationProjections,
      projectionUpload.projectionMetadata,
      strategicAlignment.priorityNotes,
      strategicAlignment.selectedPriorities,
      strategicAlignment.selectedStrategyIds,
      strategicAlignment.strategyNotes,
    ]
  );

  const serializedSnapshot = useMemo(() => JSON.stringify(snapshot), [snapshot]);
  const lastLoadedProjectIdRef = useRef<string | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const suppressNextAutosaveRef = useRef(false);

  useEffect(() => {
    if (!currentProjectId || lastLoadedProjectIdRef.current === currentProjectId) {
      return;
    }

    let cancelled = false;
    lastLoadedProjectIdRef.current = currentProjectId;
    setSyncState({ syncStatus: 'loading', syncError: null });

    void (async () => {
      try {
        const response = await fetch(`/api/projects/${currentProjectId}`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as SavedProjectResponse | { error?: string };

        if (!response.ok || !('project' in payload)) {
          throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load active project.');
        }

        if (cancelled) return;

        suppressNextAutosaveRef.current = true;
        if (payload.project.drafts.businessCase) {
          replaceBusinessCaseDraft(payload.project.drafts.businessCase.payload);
        }
        if (payload.project.drafts.strategicAlignment) {
          replaceStrategicAlignmentDraft(payload.project.drafts.strategicAlignment.payload);
        }
        if (payload.project.drafts.projectionUpload) {
          replaceProjectionUploadDraft(payload.project.drafts.projectionUpload.payload);
        }

        lastLoadedProjectIdRef.current = payload.project.projectId;
        lastSavedSnapshotRef.current = JSON.stringify(
          buildSnapshot(
            payload.project.drafts.businessCase?.payload ?? snapshot.businessCaseDraft,
            payload.project.drafts.strategicAlignment?.payload ?? snapshot.strategicAlignmentDraft,
            payload.project.drafts.projectionUpload?.payload ?? snapshot.projectionUploadDraft
          )
        );
        setSyncState({
          syncStatus: 'saved',
          syncError: null,
          lastSyncedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (cancelled) return;
        lastLoadedProjectIdRef.current = null;
        setSyncState({
          syncStatus: 'error',
          syncError: error instanceof Error ? error.message : 'Failed to load active project.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currentProjectId,
    replaceBusinessCaseDraft,
    replaceProjectionUploadDraft,
    replaceStrategicAlignmentDraft,
    setSyncState,
    snapshot.businessCaseDraft,
    snapshot.projectionUploadDraft,
    snapshot.strategicAlignmentDraft,
  ]);

  useEffect(() => {
    if (!snapshot.name.trim()) {
      return;
    }

    if (syncStatus === 'loading') {
      return;
    }

    if (suppressNextAutosaveRef.current) {
      suppressNextAutosaveRef.current = false;
      return;
    }

    if (lastSavedSnapshotRef.current === serializedSnapshot && currentProjectId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          setSyncState({ syncStatus: 'saving', syncError: null });

          const response = await fetch('/api/projects', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              projectId: currentProjectId ?? undefined,
              ...snapshot,
            }),
          });

          const payload = (await response.json()) as { project?: SavedProjectSummary; error?: string };

          if (!response.ok || !payload.project) {
            throw new Error(payload.error || 'Failed to save project.');
          }

          setCurrentProjectId(payload.project.projectId);
          lastLoadedProjectIdRef.current = payload.project.projectId;
          lastSavedSnapshotRef.current = serializedSnapshot;
          setSyncState({
            syncStatus: 'saved',
            syncError: null,
            lastSyncedAt: new Date().toISOString(),
          });
        } catch (error) {
          setSyncState({
            syncStatus: 'error',
            syncError: error instanceof Error ? error.message : 'Failed to save project.',
          });
        }
      })();
    }, 1200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    currentProjectId,
    syncStatus,
    serializedSnapshot,
    setCurrentProjectId,
    setSyncState,
    snapshot.name,
  ]);

  return {
    currentProjectId,
    syncStatus,
    syncError,
    lastSyncedAt,
  };
}
