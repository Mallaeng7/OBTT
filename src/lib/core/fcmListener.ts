import { listen } from '@liamcottle/push-receiver';
import type { Repositories, RustServerRow, DeviceRow, DeviceType } from '../db/repositories';
import type { RustPlusManager } from './rustplusManager';

/** Rust+ FCM entityType → 내부 타입 */
const ENTITY_TYPE: Record<string, DeviceType> = {
  '1': 'switch',
  '2': 'alarm',
  '3': 'storage_monitor'
};

export interface FcmHooks {
  onServerPaired?: (server: RustServerRow) => void;
  onEntityPaired?: (server: RustServerRow, device: DeviceRow) => void;
  onAlarmPush?: (guildId: string, title: string, message: string) => void;
}

interface ActiveListener {
  instance: any;
  persistentIds: string[];
}

/**
 * 유저별 FCM 크리덴셜로 푸시를 수신하여
 * 서버/기기 페어링과 스마트 알람 알림을 처리한다.
 */
export class FcmListener {
  private listeners = new Map<string, ActiveListener>();
  hooks: FcmHooks = {};

  constructor(
    private repos: Repositories,
    private manager: RustPlusManager
  ) {}

  async startAll(): Promise<void> {
    for (const row of this.repos.listCredentials()) {
      await this.start(row.discord_user_id);
    }
  }

  async start(discordUserId: string): Promise<void> {
    this.stop(discordUserId);
    const row = this.repos.getCredentials(discordUserId);
    if (!row) return;

    let creds: any;
    try {
      creds = JSON.parse(row.fcm_credentials);
    } catch {
      console.error(`[fcm] invalid credentials JSON for ${discordUserId}`);
      return;
    }
    // rustplusplus 크리덴셜 앱 출력 형식: { fcm_credentials: {...} } 또는 크리덴셜 본문 자체
    const fcmCredentials = creds.fcm_credentials ?? creds;

    const active: ActiveListener = { instance: null, persistentIds: [] };
    try {
      active.instance = await listen(
        { ...fcmCredentials, persistentIds: active.persistentIds },
        ({ notification, persistentId }: any) => {
          active.persistentIds.push(persistentId);
          try {
            this.handleNotification(row.guild_id, notification);
          } catch (err) {
            console.error('[fcm] notification handling error', err);
          }
        }
      );
      this.listeners.set(discordUserId, active);
      console.log(`[fcm] listening for ${discordUserId}`);
    } catch (err) {
      console.error(`[fcm] listen failed for ${discordUserId}:`, (err as Error).message);
    }
  }

  stop(discordUserId: string): void {
    const active = this.listeners.get(discordUserId);
    if (!active) return;
    try {
      active.instance?.destroy?.();
      active.instance?.close?.();
    } catch {
      /* ignore */
    }
    this.listeners.delete(discordUserId);
  }

  stopAll(): void {
    for (const id of [...this.listeners.keys()]) this.stop(id);
  }

  private handleNotification(guildId: string, notification: any): void {
    const data = notification?.data;
    if (!data?.body) return;

    let body: any;
    try {
      body = JSON.parse(data.body);
    } catch {
      return;
    }

    const channel = data.channelId;

    if (channel === 'pairing') {
      if (body.type === 'server') {
        const server = this.repos.upsertServer({
          guild_id: guildId,
          title: body.name || `${body.ip}:${body.port}`,
          ip: String(body.ip),
          port: Number(body.port),
          player_id: String(body.playerId),
          player_token: String(body.playerToken)
        });
        this.manager.connectServer(server.id);
        this.hooks.onServerPaired?.(server);
      } else if (body.type === 'entity') {
        const server = this.repos
          .listServers(guildId)
          .find((s) => s.ip === String(body.ip) && s.port === Number(body.port));
        if (!server) return;
        const type = ENTITY_TYPE[String(body.entityType)] ?? 'switch';
        const device = this.repos.upsertDevice(
          server.id,
          String(body.entityId),
          type,
          body.entityName || `${type}-${body.entityId}`
        );
        this.hooks.onEntityPaired?.(server, device);
      }
      return;
    }

    if (channel === 'alarm') {
      this.hooks.onAlarmPush?.(guildId, data.title || 'Alarm', data.message || '');
    }
  }
}
