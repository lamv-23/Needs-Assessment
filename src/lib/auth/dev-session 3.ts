import { NextRequest } from 'next/server';
import type { EnsureUserAccountInput } from '@/lib/repositories/projects-sqlite';
import { getProjectsRepository } from '@/lib/repositories';

export interface RequestUserIdentity {
  userId: string;
  displayName: string;
  email: string | null;
  role: 'user' | 'admin';
}

type AuthMode = 'development' | 'proxy';

function getAuthMode(): AuthMode {
  const configured = process.env.AUTH_MODE?.trim();
  if (!configured) {
    return process.env.NODE_ENV === 'production' ? 'proxy' : 'development';
  }

  if (configured === 'development' || configured === 'proxy') {
    return configured;
  }

  throw new Error(`Unsupported AUTH_MODE: ${configured}`);
}

function getDevIdentityFromRequest(req: NextRequest): RequestUserIdentity {
  const userId = req.headers.get('x-dev-user-id')?.trim() || 'local-dev-user';
  const displayName = req.headers.get('x-dev-user-name')?.trim() || 'Local Dev User';
  const email = req.headers.get('x-dev-user-email')?.trim() || null;
  const roleHeader = req.headers.get('x-dev-user-role')?.trim();
  const role = roleHeader === 'admin' ? 'admin' : 'user';

  return { userId, displayName, email, role };
}

function getProxyIdentityFromRequest(req: NextRequest): RequestUserIdentity {
  const userId = req.headers.get('x-auth-user-id')?.trim();
  const displayName = req.headers.get('x-auth-user-name')?.trim();
  const email = req.headers.get('x-auth-user-email')?.trim() || null;
  const roleHeader = req.headers.get('x-auth-user-role')?.trim();

  if (!userId || !displayName) {
    throw new Error(
      'Authenticated proxy headers are missing. Configure reverse-proxy identity headers or set AUTH_MODE=development locally.'
    );
  }

  return {
    userId,
    displayName,
    email,
    role: roleHeader === 'admin' ? 'admin' : 'user',
  };
}

export async function getRequestUserIdentity(req: NextRequest): Promise<RequestUserIdentity> {
  let identity: RequestUserIdentity;
  switch (getAuthMode()) {
    case 'development':
      identity = getDevIdentityFromRequest(req);
      break;
    case 'proxy':
      identity = getProxyIdentityFromRequest(req);
      break;
  }
  const userRecord: EnsureUserAccountInput = {
    userId: identity.userId,
    displayName: identity.displayName,
    email: identity.email,
    role: identity.role,
  };
  await getProjectsRepository().ensureProjectUserAccount(userRecord);
  return identity;
}
