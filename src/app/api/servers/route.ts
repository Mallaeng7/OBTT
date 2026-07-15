import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/runtime';

export async function GET() {
  const auth = await requireRole('viewer');
  if (auth instanceof NextResponse) return auth;

  const { repos, state } = getRuntime();
  const servers = repos.listServers().map((s) => ({
    id: s.id,
    guildId: s.guild_id,
    title: s.title,
    ip: s.ip,
    port: s.port,
    isActive: s.is_active === 1,
    status: state.get(s.id).status
  }));
  return NextResponse.json(servers);
}
