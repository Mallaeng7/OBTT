import { config } from '../config';

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';

/** Steam OpenID 2.0 로그인 URL 생성 */
export function steamLoginUrl(): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': config.steamReturnUrl,
    'openid.realm': config.webBaseUrl,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
  });
  return `${STEAM_OPENID}?${params.toString()}`;
}

/**
 * Steam OpenID 콜백 검증 (check_authentication).
 * @returns 검증 성공 시 SteamID64, 실패 시 null
 */
export async function verifySteamAssertion(searchParams: URLSearchParams): Promise<string | null> {
  const params = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('openid.')) params.set(key, value);
  }
  params.set('openid.mode', 'check_authentication');

  const res = await fetch(STEAM_OPENID, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const text = await res.text();
  if (!/is_valid\s*:\s*true/.test(text)) return null;

  const claimedId = searchParams.get('openid.claimed_id') || '';
  const match = claimedId.match(/\/openid\/id\/(\d{17})$/);
  return match ? match[1] : null;
}

export interface SteamProfile {
  personaName: string;
  avatar: string;
}

/** Steam Web API로 프로필(닉네임/아바타) 조회 — API 키 없으면 기본값 */
export async function fetchSteamProfile(steamId: string): Promise<SteamProfile> {
  if (!config.steamApiKey) return { personaName: steamId, avatar: '' };
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${config.steamApiKey}&steamids=${steamId}`;
    const res = await fetch(url);
    const json = await res.json();
    const p = json?.response?.players?.[0];
    return { personaName: p?.personaname || steamId, avatar: p?.avatarfull || '' };
  } catch {
    return { personaName: steamId, avatar: '' };
  }
}
