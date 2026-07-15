export interface ParsedCredentials {
  androidId: string;
  securityToken: string;
  steamId?: string;
  issuedDate?: number;
  expireDate?: number;
}

function parseFlat(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of raw.trim().split(/\s+/)) {
    const idx = token.indexOf(':');
    if (idx === -1) continue;
    out[token.slice(0, idx)] = token.slice(idx + 1);
  }
  return out;
}

/**
 * 크리덴셜 입력을 파싱한다. 두 가지 형식을 지원:
 *  1) 공백 구분 key:value 형식 (rustplusplus 크리덴셜 생성기 출력)
 *     gcm_android_id:... gcm_security_token:... steam_id:... issued_date:... expire_date:...
 *  2) JSON ({ gcm: { android_id, security_token }, ... } 또는 { androidId, securityToken })
 */
export function parseCredentialsInput(raw: string): ParsedCredentials {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('크리덴셜이 비어있습니다.');

  if (trimmed.startsWith('{')) {
    let obj: any;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      throw new Error('JSON 형식이 올바르지 않습니다.');
    }
    const gcm = obj.gcm ?? obj;
    const androidId = gcm.android_id ?? gcm.androidId ?? obj.gcm_android_id;
    const securityToken = gcm.security_token ?? gcm.securityToken ?? obj.gcm_security_token;
    if (!androidId || !securityToken) {
      throw new Error('gcm.android_id / gcm.security_token 필드를 찾을 수 없습니다.');
    }
    return {
      androidId: String(androidId),
      securityToken: String(securityToken),
      steamId: obj.steam_id ?? obj.steamId ?? undefined,
      issuedDate: obj.issued_date ?? obj.issuedDate ?? undefined,
      expireDate: obj.expire_date ?? obj.expireDate ?? undefined
    };
  }

  const fields = parseFlat(trimmed);
  const androidId = fields.gcm_android_id ?? fields.android_id ?? fields.androidId;
  const securityToken = fields.gcm_security_token ?? fields.security_token ?? fields.securityToken;
  if (!androidId || !securityToken) {
    throw new Error('gcm_android_id / gcm_security_token 값을 찾을 수 없습니다.');
  }
  return {
    androidId,
    securityToken,
    steamId: fields.steam_id,
    issuedDate: fields.issued_date ? Number(fields.issued_date) : undefined,
    expireDate: fields.expire_date ? Number(fields.expire_date) : undefined
  };
}

export function isExpired(creds: ParsedCredentials): boolean {
  if (!creds.expireDate) return false;
  return Date.now() / 1000 > creds.expireDate;
}
