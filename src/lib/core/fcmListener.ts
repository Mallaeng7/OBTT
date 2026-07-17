import { Client as PushReceiverClient } from '@liamcottle/push-receiver';
import type { Repositories, RustServerRow, DeviceRow, DeviceType } from '../db/repositories';
import type { RustPlusManager } from './rustplusManager';
import { parseCredentialsInput, isExpired, type ParsedCredentials } from './credentials';

/** channelId=pairing, body.type=entity 일 때 body.entityName → 내부 타입 */
const ENTITY_NAME: Record<string, DeviceType> = {
  'Smart Switch': 'switch',
  'Smart Alarm': 'alarm',
  'Storage Monitor': 'storage_monitor'
};

const DEFAULT_NAME: Record<DeviceType, string> = {
  switch: '스위치',
  alarm: '알람',
  storage_monitor: '저장 모니터'
};

export interface FcmHooks {
  onServerPaired?: (server: RustServerRow) => void;
  onEntityPaired?: (server: RustServerRow, device: DeviceRow) => void;
  onAlarmPush?: (guildId: string, title: string, message: string) => void;
  onCredentialsExpired?: (discordUserId: string, guildId: string) => void;
}

interface ActiveListener {
  client: any;
}

/**
 * 유저별 FCM 크리덴셜로 GCM 푸시를 직접 수신한다.
 * Rust+ 알림은 암호화되지 않은 'ON_DATA_RECEIVED' 이벤트로 오므로
 * (@liamcottle/push-receiver 의 상위 listen() 헬퍼가 구독하는
 * 'ON_NOTIFICATION_RECEIVED' 는 발생하지 않는다) Client를 직접 사용한다.
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

    let creds: ParsedCredentials;
    try {
      creds = JSON.parse(row.fcm_credentials);
    } catch {
      console.error(`[fcm] stored credentials corrupt for ${discordUserId}`);
      return;
    }

    if (isExpired(creds)) {
      console.warn(`[fcm] credentials expired for ${discordUserId}`);
      this.hooks.onCredentialsExpired?.(discordUserId, row.guild_id);
      return;
    }

    const client = new PushReceiverClient(creds.androidId, creds.securityToken, []);
    client.on('ON_DATA_RECEIVED', (data: any) => {
      try {
        this.handleDataReceived(row.guild_id, data);
      } catch (err) {
        console.error('[fcm] notification handling error', err);
      }
    });

    try {
      await client.connect();
      this.listeners.set(discordUserId, { client });
      console.log(`[fcm] listening for ${discordUserId}`);
    } catch (err) {
      console.error(`[fcm] connect failed for ${discordUserId}:`, (err as Error).message);
    }
  }

  stop(discordUserId: string): void {
    const active = this.listeners.get(discordUserId);
    if (!active) return;
    try {
      active.client.destroy();
    } catch {
      /* ignore */
    }
    this.listeners.delete(discordUserId);
  }

  stopAll(): void {
    for (const id of [...this.listeners.keys()]) this.stop(id);
  }

  private handleDataReceived(guildId: string, data: any): void {
    const appData = data?.appData as { key: string; value: string }[] | undefined;
    if (!appData) return;

    const get = (key: string) => appData.find((item) => item.key === key)?.value;
    const title = get('title') ?? '';
    const message = get('message') ?? '';
    const channelId = get('channelId');
    const bodyRaw = get('body');
    if (!channelId || !bodyRaw) return;

    let body: any;
    try {
      body = JSON.parse(bodyRaw);
    } catch {
      return;
    }

    if (channelId === 'pairing') {
      if (body.type === 'server') {
        const server = this.repos.upsertServer({
          guild_id: guildId,
          title: title || `${body.ip}:${body.port}`,
          ip: String(body.ip),
          port: Number(body.port),
          player_id: String(body.playerId),
          player_token: String(body.playerToken)
        });
        this.manager.connectServerManual(server.id);
        this.hooks.onServerPaired?.(server);
      } else if (body.type === 'entity') {
        const server = this.repos
          .listServers(guildId)
          .find((s) => s.ip === String(body.ip) && s.port === Number(body.port));
        if (!server) return;
        const type = ENTITY_NAME[String(body.entityName)];
        if (!type) return;
        const entityId = String(body.entityId);
        const device = this.repos.upsertDevice(server.id, entityId, type, `${DEFAULT_NAME[type]} #${entityId.slice(-4)}`);
        this.hooks.onEntityPaired?.(server, device);
      }
      return;
    }

    if (channelId === 'alarm' && body.type === 'alarm') {
      this.hooks.onAlarmPush?.(guildId, title, message);
    }
  }
}

export { parseCredentialsInput };
