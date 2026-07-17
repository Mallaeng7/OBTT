import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/runtime';

/** Rust+ 연결 수동 연결/해제 — admin 전용. 끊으면 서버 재시작 후에도 자동 재연결하지 않는다. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('admin');
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const serverId = Number(id);
  const { repos, manager } = getRuntime();
  if (!repos.getServer(serverId)) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (typeof body?.connected !== 'boolean') {
    return NextResponse.json({ error: 'connected(boolean) 필요' }, { status: 400 });
  }

  if (body.connected) manager.connectServerManual(serverId);
  else manager.disconnectServerManual(serverId);

  return NextResponse.json({ ok: true, connected: body.connected });
}
