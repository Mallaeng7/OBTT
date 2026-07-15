import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';

export async function GET() {
  const auth = await requireRole('viewer');
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  return NextResponse.json({
    steamId: user.steam_id,
    personaName: user.persona_name,
    avatar: user.avatar,
    role: user.role,
    linkedDiscordId: user.linked_discord_id
  });
}
