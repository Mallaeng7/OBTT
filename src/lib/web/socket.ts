import { Server as SocketIOServer } from 'socket.io';
import { unsealData } from 'iron-session';
import type { Server as HttpServer } from 'http';
import { config } from '../config';
import type { Runtime } from '../runtime';
import type { SessionData } from '../auth/session';

/**
 * Socket.IO 게이트웨이 — StateStore의 변경을 인증된 브라우저 세션에 실시간 푸시.
 */
export function attachSocket(httpServer: HttpServer, runtime: Runtime): SocketIOServer {
  const io = new SocketIOServer(httpServer, { path: '/socket.io' });

  io.use((socket, next) => {
    void (async () => {
      try {
        const cookieHeader = socket.handshake.headers.cookie || '';
        const match = cookieHeader.match(/(?:^|;\s*)obtt_session=([^;]+)/);
        if (!match) return next(new Error('unauthorized'));
        const session = await unsealData<SessionData>(decodeURIComponent(match[1]), {
          password: config.sessionSecret
        });
        if (!session?.steamId) return next(new Error('unauthorized'));
        (socket.data as any).steamId = session.steamId;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    })();
  });

  io.on('connection', (socket) => {
    // 접속 시 현재 스냅샷 전송
    socket.emit('snapshot', runtime.state.all());
  });

  runtime.state.on('server:update', (state) => io.emit('server:update', state));
  runtime.state.on('server:event', (event) => io.emit('server:event', event));
  runtime.state.on('device:state', (change) => io.emit('device:state', change));

  return io;
}
