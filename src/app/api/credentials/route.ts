import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/runtime';
import { parseCredentialsInput } from '@/lib/core/credentials';

/**
 * 웹에서 FCM 크리덴셜 등록 — 디스코드 계정 연동(/link) 필수.
 * `credentials`는 문자열로 전달: "gcm_android_id:... gcm_security_token:... steam_id:... issued_date:... expire_date:..."
 * 형식(rustplusplus 크리덴셜 생성기 출력) 또는 JSON 문자열을 그대로 받는다.
 */
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

  let parsed;
  try {
    parsed = parseCredentialsInput(raw);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const { repos, fcm } = getRuntime();
  repos.ensureGuild(guildId);
  repos.setCredentials(user.linked_discord_id, guildId, JSON.stringify(parsed));
  await fcm.start(user.linked_discord_id);
  return NextResponse.json({ ok: true });
}
