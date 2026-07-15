import { NextRequest, NextResponse } from 'next/server';
import { verifySteamAssertion, fetchSteamProfile } from '@/lib/auth/steam';
import { getSession } from '@/lib/auth/session';
import { getRuntime } from '@/lib/runtime';
import { config } from '@/lib/config';

export async function GET(req: NextRequest) {
  const steamId = await verifySteamAssertion(req.nextUrl.searchParams);
  if (!steamId) {
    return NextResponse.redirect(new URL('/login?error=steam', config.webBaseUrl));
  }

  const { repos } = getRuntime();
  const profile = await fetchSteamProfile(steamId);
  const isAdmin = config.adminSteamIds.includes(steamId);
  const existing = repos.getUser(steamId);
  const user = repos.upsertUser(steamId, profile.personaName, profile.avatar, isAdmin ? 'admin' : 'viewer');
  // ADMIN_STEAM_IDS 는 항상 admin 보장 (기존 유저 포함)
  if (isAdmin && user.role !== 'admin') repos.setUserRole(steamId, 'admin');
  else if (existing && !isAdmin && user.role !== existing.role) repos.setUserRole(steamId, existing.role);

  const session = await getSession();
  session.steamId = steamId;
  await session.save();

  return NextResponse.redirect(new URL('/', config.webBaseUrl));
}
