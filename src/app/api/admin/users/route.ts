import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/runtime';
import type { Role } from '@/lib/db/repositories';

export async function GET() {
  const auth = await requireRole('admin');
  if (auth instanceof NextResponse) return auth;

  const users = getRuntime().repos.listUsers().map((u) => ({
    steamId: u.steam_id,
    personaName: u.persona_name,
    avatar: u.avatar,
    role: u.role,
    linkedDiscordId: u.linked_discord_id,
    lastLoginAt: u.last_login_at
  }));
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const auth = await requireRole('admin');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const steamId = String(body?.steamId || '');
  const role = String(body?.role || '') as Role;
  if (!steamId || !['admin', 'manager', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'steamId, role(admin|manager|viewer) 필요' }, { status: 400 });
  }
  const { repos } = getRuntime();
  if (!repos.getUser(steamId)) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  repos.setUserRole(steamId, role);
  return NextResponse.json({ ok: true });
}
