import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/runtime';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('viewer');
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const serverId = Number(id);
  const { repos, state } = getRuntime();
  const server = repos.getServer(serverId);
  if (!server) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({
    server: {
      id: server.id,
      title: server.title,
      ip: server.ip,
      port: server.port,
      isActive: server.is_active === 1,
      eventsEnabled: server.events_enabled === 1
    },
    state: state.get(serverId),
    devices: repos.listDevices(serverId).map((d) => ({
      id: d.id,
      entityId: d.entity_id,
      type: d.type,
      name: d.name,
      group: d.group_name,
      state: d.state === 1
    })),
    recentEvents: repos.recentEvents(serverId, 30)
  });
}
