import { NextRequest, NextResponse } from 'next/server';
import { parseProjectIdParam } from '@/lib/api/project-api';
import { getRequestUserIdentity } from '@/lib/auth/dev-session';
import { getProjectsRepository } from '@/lib/repositories';
import { logServerWarn } from '@/lib/server/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const identity = await getRequestUserIdentity(req);
    const projectId = parseProjectIdParam(params.projectId);
    if (!projectId) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const snapshot = await getProjectsRepository().getProjectSnapshot(projectId);

    if (!snapshot) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (snapshot.ownerId !== identity.userId) {
      logServerWarn('project_read_forbidden', {
        projectId,
        actingUserId: identity.userId,
        ownerId: snapshot.ownerId,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ project: snapshot, user: identity });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load project';
    const status = /production/i.test(message) ? 501 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
