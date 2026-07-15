import { NextResponse } from 'next/server';
import { getSession } from './session';
import { getRuntime } from '../runtime';
import type { Role, UserRow } from '../db/repositories';

const ROLE_LEVEL: Record<Role, number> = { viewer: 0, manager: 1, admin: 2 };

export interface AuthResult {
  user: UserRow;
}

/**
 * API 라우트 인증/권한 가드.
 * @returns 통과 시 { user }, 실패 시 NextResponse (401/403)
 */
export async function requireRole(minRole: Role): Promise<AuthResult | NextResponse> {
  const session = await getSession();
  if (!session.steamId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const user = getRuntime().repos.getUser(session.steamId);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (ROLE_LEVEL[user.role] < ROLE_LEVEL[minRole]) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return { user };
}
