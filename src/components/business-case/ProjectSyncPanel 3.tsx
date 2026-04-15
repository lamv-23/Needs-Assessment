'use client';

import { useEffect, useState } from 'react';
import {
  Save,
  RefreshCw,
  FolderOpen,
  Loader2,
} from 'lucide-react';
import type {
  BusinessCaseDraft,
  ProjectionUploadDraft,
  StrategicAlignmentDraft,
} from '@/lib/persistence/project-state';
import { useBusinessCaseStore } from '@/store/businessCaseStore';
import { useProjectSync } from '@/hooks/useProjectSync';
import { useProjectSessionStore } from '@/store/projectSessionStore';
import { useProjectionStore } from '@/store/projectionStore';
import { useStrategicAlignmentStore } from '@/store/strategicAlignmentStore';

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

interface ProjectListResponse {
  projects: SavedProjectSummary[];
}

export function ProjectSyncPanel({
  onProjectLoaded,
}: {
  onProjectLoaded?: () => void;
}) {
  const { currentProjectId, syncStatus, syncError, lastSyncedAt } = useProjectSync();
  const businessCase = useBusinessCaseStore();
  const strategicAlignment = useStrategicAlignmentStore();
  const projectionStore = useProjectionStore();
  const setCurrentProjectId = useProjectSessionStore((state) => state.setCurrentProjectId);

  const [projects, setProjects] = useState<SavedProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshProjects = async () => {
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/projects', { cache: 'no-store' });
      const payload = (await response.json()) as ProjectListResponse | { error?: string };

      if (!response.ok || !('projects' in payload)) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load saved projects.');
      }

      setProjects(payload.projects);
      setSelectedProjectId((current) => current || payload.projects[0]?.projectId || '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load saved projects.');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void refreshProjects();
  }, []);

  useEffect(() => {
    if (!currentProjectId) return;
    setSelectedProjectId(currentProjectId);
  }, [currentProjectId]);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          projectId: currentProjectId || undefined,
          name: businessCase.projectName,
          projectType: businessCase.projectType,
          areaIds: businessCase.areaIds,
          businessCaseDraft: {
            projectName: businessCase.projectName,
            projectType: businessCase.projectType,
            areaIds: businessCase.areaIds,
            themes: businessCase.themes,
            sectionToggles: businessCase.sectionToggles,
          },
          strategicAlignmentDraft: {
            selectedStrategyIds: strategicAlignment.selectedStrategyIds,
            strategyNotes: strategicAlignment.strategyNotes,
            selectedPriorities: strategicAlignment.selectedPriorities,
            priorityNotes: strategicAlignment.priorityNotes,
          },
          projectionUploadDraft: {
            populationProjections: projectionStore.populationProjections,
            projectionMetadata: projectionStore.projectionMetadata,
          },
        }),
      });

      const payload = (await response.json()) as { project?: SavedProjectSummary; error?: string };
      if (!response.ok || !payload.project) {
        throw new Error(payload.error || 'Failed to save project.');
      }

      setCurrentProjectId(payload.project.projectId);
      setSelectedProjectId(payload.project.projectId);
      setStatusMessage(`Saved "${payload.project.name}" to the server-backed project store.`);
      await refreshProjects();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save project.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = async () => {
    if (!selectedProjectId) return;

    setIsLoadingProject(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/projects/${selectedProjectId}`, {
        cache: 'no-store',
      });
      const payload = (await response.json()) as SavedProjectResponse | { error?: string };

      if (!response.ok || !('project' in payload)) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to load project.');
      }

      setCurrentProjectId(payload.project.projectId);
      setStatusMessage(`Loading "${payload.project.name}" from the server-backed project store...`);
      onProjectLoaded?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load project.');
    } finally {
      setIsLoadingProject(false);
    }
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">Project sync</p>
        <p className="mt-1 text-xs text-blue-800">
          Active projects now auto-save business-case, strategic-alignment, and upload drafts to the server-backed project store.
        </p>
      </div>

      <div className="space-y-2">
        <button
          onClick={handleSave}
          disabled={isSaving || !businessCase.projectName}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save server draft
        </button>

        <button
          onClick={() => void refreshProjects()}
          disabled={isRefreshing}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-900 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh saved projects
        </button>

        <div className="space-y-2">
          <select
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value="">Select a saved project</option>
            {projects.map((project) => (
              <option key={project.projectId} value={project.projectId}>
                {project.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleLoad}
            disabled={isLoadingProject || !selectedProjectId}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-900 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingProject ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            Load selected project
          </button>
        </div>
      </div>

      {currentProjectId && (
        <p className="text-[11px] text-blue-700 break-all">
          Active server project: <span className="font-medium">{currentProjectId}</span>
        </p>
      )}

      <p className="text-[11px] text-blue-700">
        Sync status:{' '}
        <span className="font-medium capitalize">{syncStatus}</span>
        {lastSyncedAt ? ` · ${new Date(lastSyncedAt).toLocaleTimeString()}` : ''}
      </p>

      {statusMessage && (
        <p className="text-xs text-emerald-700">{statusMessage}</p>
      )}

      {syncError && !errorMessage && (
        <p className="text-xs text-red-700">{syncError}</p>
      )}

      {errorMessage && (
        <p className="text-xs text-red-700">{errorMessage}</p>
      )}
    </div>
  );
}
