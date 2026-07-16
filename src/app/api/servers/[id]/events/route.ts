import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/runtime';

/** 이벤트(카고/헬기/CH47 등) 알림 on/off — admin 전용 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('admin');
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const serverId = Number(id);
  const { repos } = getRuntime();
  if (!repos.getServer(serverId)) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled(boolean) 필요' }, { status: 400 });
  }

  repos.setEventsEnabled(serverId, body.enabled);
  return NextResponse.json({ ok: true, eventsEnabled: body.enabled });
}
