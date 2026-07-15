import { NextRequest, NextResponse } from 'next/server';
import { unsealData } from 'iron-session';

const PUBLIC_PATHS = ['/login', '/api/auth/steam', '/api/auth/steam/return'];

/** 모든 페이지·API를 Steam OAuth 세션 없이는 차단 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get('obtt_session')?.value;
  let authorized = false;
  if (cookie) {
    try {
      const session = await unsealData<{ steamId?: string }>(cookie, {
        password: process.env.SESSION_SECRET || 'obtt-dev-secret-change-me-in-production!!'
      });
      authorized = !!session?.steamId;
    } catch {
      authorized = false;
    }
  }

  if (authorized) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|socket.io).*)']
};
