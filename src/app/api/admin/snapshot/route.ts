import { NextRequest, NextResponse } from 'next/server';
import { createSnapshot, listSnapshots, activateSnapshot, deleteSnapshot } from '@/lib/db';
import { getRequestUserIdentity } from '@/lib/auth/dev-session';

function isAuthorizedByKey(key: string | null): boolean {
  return key === process.env.ADMIN_KEY;
}

async function resolveAdminRequestContext(req: NextRequest): Promise<{
  authorized: boolean;
  requestedBy: string | null;
}> {
  const key = req.nextUrl.searchParams.get('key') ?? req.headers.get('x-admin-key');
  if (isAuthorizedByKey(key)) {
    try {
      const identity = await getRequestUserIdentity(req);
      if (identity.role === 'admin') {
        return { authorized: true, requestedBy: identity.userId };
      }
    } catch {}
    return { authorized: true, requestedBy: 'admin-key' };
  }

  try {
    const identity = await getRequestUserIdentity(req);
    return {
      authorized: identity.role === 'admin',
      requestedBy: identity.role === 'admin' ? identity.userId : null,
    };
  } catch {
    return { authorized: false, requestedBy: null };
  }
}

export async function GET(req: NextRequest) {
  const auth = await resolveAdminRequestContext(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const snapshots = listSnapshots();
  return NextResponse.json({ snapshots });
}

export async function POST(req: NextRequest) {
  const auth = await resolveAdminRequestContext(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, tag, description } = body;

    if (action === 'create' && tag) {
      const snapshot = createSnapshot(tag, description);
      return NextResponse.json({ snapshot });
    }

    if (action === 'activate' && tag) {
      const ok = activateSnapshot(tag);
      return NextResponse.json({ success: ok, tag });
    }

    if (action === 'delete' && tag) {
      const ok = deleteSnapshot(tag);
      return NextResponse.json({ success: ok });
    }

    return NextResponse.json({ error: 'Invalid action. Use: create, activate, or delete' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}