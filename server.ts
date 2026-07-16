import 'dotenv/config';
import http from 'http';
import { parse } from 'url';
import next from 'next';
import { initRuntime, shutdownRuntime } from './src/lib/runtime-init';
import { attachSocket } from './src/lib/web/socket';
import { fixRustplusProto } from './src/lib/core/fixRustplusProto';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

async function main() {
  // 0) rustplus.js의 required 필드 protobuf 스키마를 optional로 자가 치유
  //    (postinstall patch-package가 스킵/실패해도 항상 적용되도록 부팅 시점에 재확인)
  fixRustplusProto();

  // 1) Next.js 준비 (프론트 + API)
  const app = next({ dev });
  await app.prepare();
  const handle = app.getRequestHandler();

  // 2) HTTP 서버
  const server = http.createServer((req, res) => {
    handle(req, res, parse(req.url || '/', true)).catch((err) => {
      console.error('[http]', err);
      res.statusCode = 500;
      res.end('internal server error');
    });
  });

  // 3) 공유 런타임 초기화 (SQLite + 디스코드 봇 + Rust+ 세션 + FCM)
  const runtime = await initRuntime();

  // 4) Socket.IO 실시간 게이트웨이
  attachSocket(server, runtime);

  server.listen(port, () => {
    console.log(`[OBTT] ready → http://localhost:${port} (${dev ? 'dev' : 'production'})`);
  });

  // 5) graceful shutdown — 세션 정리 후 DB 정상 close
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      await shutdownRuntime();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    })();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('[OBTT] fatal:', err);
  process.exit(1);
});
