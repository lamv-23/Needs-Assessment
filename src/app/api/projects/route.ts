import { NextRequest, NextResponse } from 'next/server';
import {
  canWriteProject,
  parseProjectSaveRequest,
} from '@/lib/api/project-api';
import { getRequestUserIdentity } from '@/lib/auth/dev-session';
import {
  createProjectDraftEnvelope,
} from '@/lib/persistence/project-state';
import { getProjectsRepository } from '@/lib/repositories';
import { logServerInfo, logServerWarn } from '@/lib/server/logger';

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: NextRequest) {
  try {
    const identity = await getRequestUserIdentity(req);
    const projects = await getProjectsRepository().listProjectsForOwner(identity.userId);
    return NextResponse.json({ projects, user: identity });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load projects';
    const status = /production/i.test(message) ? 501 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await getRequestUserIdentity(req);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    if (!body) {
      return badRequest('A JSON body is required.');
    }

    const parsed = parseProjectSaveRequest(body);
    if (!parsed) {
      return badRequest('Project payload is invalid.');
    }

    if (parsed.projectId) {
      const existingProject = await getProjectsRepository().getProjectById(parsed.projectId);
      if (!existingProject) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      if (!canWriteProject(existingProject.ownerId, identity.userId)) {
        logServerWarn('project_write_forbidden', {
          projectId: parsed.projectId,
          actingUserId: identity.userId,
          ownerId: existingProject.ownerId,
        });
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const now = new Date().toISOString();
    const project = await getProjectsRepository().saveProjectSnapshot({
      projectId: parsed.projectId,
      ownerId: identity.userId,
      name: parsed.name,
      projectType: parsed.projectType,
      areaIds: parsed.areaIds,
      drafts: {
        businessCase: createProjectDraftEnvelope('business-case', parsed.businessCaseDraft, now),
        strategicAlignment: createProjectDraftEnvelope(
          'strategic-alignment',
          parsed.strategicAlignmentDraft,
          now
        ),
        projectionUpload: createProjectDraftEnvelope(
          'projection-upload',
          parsed.projectionUploadDraft,
          now
        ),
      },
    });

    logServerInfo('project_snapshot_saved', {
      projectId: project.projectId,
      ownerId: identity.userId,
      areaCount: project.areaIds.length,
      isUpdate: Boolean(parsed.projectId),
    });

    return NextResponse.json({ project, user: identity }, { status: parsed.projectId ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save project';
    const status = /production/i.test(message) ? 501 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
