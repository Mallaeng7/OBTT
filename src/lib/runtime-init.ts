import { openDatabase } from './db';
import { Repositories } from './db/repositories';
import { StateStore } from './core/stateStore';
import { RustPlusManager } from './core/rustplusManager';
import { FcmListener } from './core/fcmListener';
import { DiscordBot } from './discord/bot';
import { setRuntime, type Runtime } from './runtime';

let runtime: Runtime | null = null;

export async function initRuntime(): Promise<Runtime> {
  if (runtime) return runtime;

  const db = openDatabase();
  const repos = new Repositories(db);
  const state = new StateStore();
  const manager = new RustPlusManager(repos, state);
  const fcm = new FcmListener(repos, manager);
  const bot = new DiscordBot(repos, manager, fcm);

  runtime = { db, repos, state, manager, fcm, bot };
  setRuntime(runtime);

  await bot.start();
  manager.startAll();
  await fcm.startAll();

  console.log('[OBTT] runtime initialized (bot + rust+ sessions + fcm)');
  return runtime;
}

export async function shutdownRuntime(): Promise<void> {
  if (!runtime) return;
  console.log('[OBTT] shutting down...');
  try {
    runtime.fcm.stopAll();
    runtime.manager.shutdown();
    await runtime.bot.stop();
  } finally {
    runtime.db.close();
    runtime = null;
  }
}
