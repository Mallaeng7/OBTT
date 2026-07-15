import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/runtime';

/** 디스코드 /link 로 발급받은 코드로 스팀↔디스코드 계정 연동 */
export async function POST(req: Request) {
  const auth = await requireRole('viewer');
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const body = await req.json().catch(() => null);
  const code = String(body?.code || '').trim();
  if (!code) return NextResponse.json({ error: 'code 필요' }, { status: 400 });

  const { repos } = getRuntime();
  const discordUserId = repos.consumeLinkCode(code);
  if (!discordUserId) return NextResponse.json({ error: '코드가 유효하지 않거나 만료되었습니다' }, { status: 400 });

  repos.linkDiscord(user.steam_id, discordUserId);
  return NextResponse.json({ ok: true, discordUserId });
}
