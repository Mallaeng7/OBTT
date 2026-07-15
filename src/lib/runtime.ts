import type { Database } from 'better-sqlite3';
import type { Repositories } from './db/repositories';
import type { StateStore } from './core/stateStore';
import type { RustPlusManager } from './core/rustplusManager';
import type { FcmListener } from './core/fcmListener';
import type { DiscordBot } from './discord/bot';

export interface Runtime {
  db: Database;
  repos: Repositories;
  state: StateStore;
  manager: RustPlusManager;
  fcm: FcmListener;
  bot: DiscordBot;
}

/**
 * 단일 프로세스 전역 런타임.
 * server.ts(커스텀 서버)가 초기화하고, Next.js Route Handler는
 * globalThis를 통해 동일 인스턴스에 접근한다 (Next 번들과 모듈 인스턴스가
 * 달라도 globalThis는 공유되므로 안전).
 */
declare global {
  // eslint-disable-next-line no-var
  var __obttRuntime: Runtime | undefined;
}

export function setRuntime(rt: Runtime): void {
  globalThis.__obttRuntime = rt;
}

export function getRuntime(): Runtime {
  const rt = globalThis.__obttRuntime;
  if (!rt) throw new Error('OBTT runtime not initialized — start via `npm start` (server.ts)');
  return rt;
}
