import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserIdentity } from '@/lib/auth/dev-session';

export async function GET(req: NextRequest) {
  try {
    const identity = await getRequestUserIdentity(req);
    return NextResponse.json({ user: identity });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve identity';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
