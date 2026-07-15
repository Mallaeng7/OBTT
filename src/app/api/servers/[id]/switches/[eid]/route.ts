import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/runtime';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; eid: string }> }) {
  const auth = await requireRole('manager');
  if (auth instanceof NextResponse) return auth;

  const { id, eid } = await params;
  const serverId = Number(id);
  const { repos, manager } = getRuntime();
  if (!repos.getServer(serverId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const device = repos.getDeviceByEntity(serverId, eid);
  if (!device || device.type !== 'switch') return NextResponse.json({ error: 'not found' }, { status: 404 });

  let action = 'toggle';
  try {
    const body = await req.json();
    if (body?.action) action = String(body.action);
  } catch {
    /* body 없으면 toggle */
  }

  try {
    let state: boolean;
    if (action === 'toggle') state = await manager.toggleSwitch(serverId, eid);
    else {
      state = action === 'on';
      await manager.setSwitch(serverId, eid, state);
    }
    return NextResponse.json({ ok: true, state });
  } catch {
    return NextResponse.json({ error: 'server offline or rust+ disconnected' }, { status: 502 });
  }
}
