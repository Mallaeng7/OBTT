import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/runtime';

/** 웹에서 FCM 크리덴셜 등록 — 디스코드 계정 연동(/link) 필수 */
export async function POST(req: Request) {
  const auth = await requireRole('viewer');
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  if (!user.linked_discord_id) {
    return NextResponse.json({ error: 'discord not linked — 디스코드에서 /link 후 연동하세요' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const guildId = String(body?.guildId || '');
  const credentials = body?.credentials;
  if (!guildId || !credentials) {
    return NextResponse.json({ error: 'guildId, credentials 필요' }, { status: 400 });
  }
  const raw = typeof credentials === 'string' ? credentials : JSON.stringify(credentials);
  try {
    JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid credentials JSON' }, { status: 400 });
  }

  const { repos, fcm } = getRuntime();
  repos.ensureGuild(guildId);
  repos.setCredentials(user.linked_discord_id, guildId, raw);
  await fcm.start(user.linked_discord_id);
  return NextResponse.json({ ok: true });
}
