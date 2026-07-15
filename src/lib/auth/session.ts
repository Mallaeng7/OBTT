import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { config } from '../config';

export interface SessionData {
  steamId?: string;
}

export const sessionOptions: SessionOptions = {
  cookieName: 'obtt_session',
  password: config.sessionSecret,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  }
};

/** Route Handler / Server Component 용 세션 접근자 */
export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
