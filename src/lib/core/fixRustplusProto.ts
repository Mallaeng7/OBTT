import fs from 'fs';
import path from 'path';

/**
 * npm에 배포된 @liamcottle/rustplus.js의 rustplus.proto는 대부분의 필드가 proto2 `required`로
 * 선언돼 있다. 실제 Rust 서버는 queuedPlayers(대기열 0명) 같은 필드를 응답에서 생략하는 경우가
 * 있는데, protobufjs는 required 필드가 빠지면 디코딩 중 ProtocolError를 던지고 이게 rustplus.js
 * 내부 WebSocket 메시지 핸들러 안에서 발생해 우리 쪽 try/catch로 잡히지 않는다(요청이 응답을
 * 영원히 못 받고 타임아웃됨).
 *
 * patch-package(postinstall)로도 고치지만, `npm ci`/`--ignore-scripts`/권한 문제 등으로
 * postinstall이 스킵되거나 실패해도 항상 정상 동작하도록 앱 부팅 시점에 한 번 더
 * node_modules의 proto 파일을 우리가 보관 중인 수정본으로 덮어써 자가 치유한다.
 */
export function fixRustplusProto(): void {
  const src = path.resolve(process.cwd(), 'vendor', 'rustplus-fixed.proto');
  const dest = path.resolve(process.cwd(), 'node_modules', '@liamcottle', 'rustplus.js', 'rustplus.proto');

  if (!fs.existsSync(src) || !fs.existsSync(dest)) return;

  const fixed = fs.readFileSync(src, 'utf8');
  const current = fs.readFileSync(dest, 'utf8');
  if (current === fixed) return;

  fs.writeFileSync(dest, fixed, 'utf8');
  console.log('[rustplus] patched vendored rustplus.proto (required -> optional) to prevent ProtocolError crashes');
}
