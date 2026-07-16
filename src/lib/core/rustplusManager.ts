import RustPlus from '@liamcottle/rustplus.js';
import { config } from '../config';
import { t } from '../i18n';
import { toGrid } from './grid';
import type { Repositories, RustServerRow } from '../db/repositories';
import type { StateStore, TeamMember } from './stateStore';

/** AppMarkerType (Rust+ 프로토콜) */
const MARKER = {
  EXPLOSION: 2,
  VENDING: 3,
  CH47: 4,
  CARGO: 5,
  CRATE: 6,
  HELI: 8
} as const;

interface MapMarker {
  id: number;
  type: number;
  x: number;
  y: number;
}

export interface ManagerHooks {
  /** 서버 이벤트 발생 (카고/헬기 등) — 디스코드 알림 + 팀챗 전송용 */
  onEvent?: (server: RustServerRow, eventType: string, message: string) => void;
  /** 인게임 팀챗 수신 */
  onTeamMessage?: (server: RustServerRow, senderName: string, senderSteamId: string, message: string) => void;
  /** 스마트 알람 트리거 */
  onAlarm?: (server: RustServerRow, deviceId: number, name: string) => void;
  /** 기기 상태 변경 (스위치 on/off) */
  onDeviceState?: (server: RustServerRow, deviceId: number, entityId: string, state: boolean) => void;
  /** 연결 상태 변경 */
  onStatus?: (server: RustServerRow, status: 'online' | 'offline') => void;
}

const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 300_000; // 기획서: 최대 5분 지수 백오프

class Session {
  rp: any = null;
  private markers = new Map<number, MapMarker>();
  private markersPrimed = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoff = RECONNECT_BASE_MS;
  private stopped = false;

  constructor(
    public row: RustServerRow,
    private manager: RustPlusManager
  ) {}

  connect(): void {
    this.stopped = false;
    this.manager.state.patch(this.row.id, { status: 'connecting' });
    this.rp = new RustPlus(this.row.ip, String(this.row.port), this.row.player_id, this.row.player_token);

    this.rp.on('connected', () => {
      this.backoff = RECONNECT_BASE_MS;
      this.manager.state.patch(this.row.id, { status: 'online' });
      this.manager.hooks.onStatus?.(this.row, 'online');
      void this.poll();
      this.pollTimer = setInterval(() => void this.poll(), config.pollingIntervalMs);
    });

    this.rp.on('disconnected', () => this.handleDown());
    this.rp.on('error', (err: Error) => {
      console.error(`[rust+ ${this.row.title}]`, err.message);
      this.handleDown();
    });
    this.rp.on('message', (msg: any) => this.handleMessage(msg));

    try {
      this.rp.connect();
    } catch (err) {
      console.error(`[rust+ ${this.row.title}] connect failed`, err);
      this.handleDown();
    }
  }

  private handleDown(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    const wasOnline = this.manager.state.get(this.row.id).status === 'online';
    this.manager.state.patch(this.row.id, { status: 'offline' });
    if (wasOnline) this.manager.hooks.onStatus?.(this.row, 'offline');
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
      this.destroySocket();
      this.connect();
    }, this.backoff);
  }

  private destroySocket(): void {
    try {
      this.rp?.removeAllListeners();
      this.rp?.disconnect();
    } catch {
      /* ignore */
    }
    this.rp = null;
  }

  disconnect(): void {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.destroySocket();
    this.manager.state.patch(this.row.id, { status: 'offline' });
  }

  /** rustplus.js 콜백 API → Promise */
  private req(fn: (cb: (msg: any) => void) => void): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.rp) return reject(new Error('not connected'));
      const timeout = setTimeout(() => reject(new Error('rust+ request timeout')), 20_000);
      try {
        fn((msg: any) => {
          clearTimeout(timeout);
          if (msg?.response?.error) reject(new Error(JSON.stringify(msg.response.error)));
          else resolve(msg?.response ?? msg);
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  getInfo() {
    return this.req((cb) => this.rp.getInfo(cb));
  }
  getTime() {
    return this.req((cb) => this.rp.getTime(cb));
  }
  getTeamInfo() {
    return this.req((cb) => this.rp.getTeamInfo(cb));
  }
  getMapMarkers() {
    return this.req((cb) => this.rp.getMapMarkers(cb));
  }
  getEntityInfo(entityId: string) {
    return this.req((cb) => this.rp.getEntityInfo(entityId, cb));
  }
  setSwitchRaw(entityId: string, on: boolean) {
    return this.req((cb) => (on ? this.rp.turnSmartSwitchOn(entityId, cb) : this.rp.turnSmartSwitchOff(entityId, cb)));
  }

  sendTeamMessage(message: string): void {
    try {
      this.rp?.sendTeamMessage(message);
    } catch (err) {
      console.error(`[rust+ ${this.row.title}] sendTeamMessage failed`, err);
    }
  }

  private async poll(): Promise<void> {
    try {
      const results = await Promise.allSettled([
        this.getInfo(),
        this.getTime(),
        this.getTeamInfo(),
        this.getMapMarkers()
      ]);

      const info = results[0].status === 'fulfilled' ? results[0].value : null;
      const time = results[1].status === 'fulfilled' ? results[1].value : null;
      const team = results[2].status === 'fulfilled' ? results[2].value : null;
      const markers = results[3].status === 'fulfilled' ? results[3].value : null;

      console.log(`[rust+ ${this.row.title}] poll info:`, results[0].status === 'fulfilled' ? 'OK' : results[0].reason);

      const mapSize = info?.info?.mapSize ?? this.manager.state.get(this.row.id).info?.mapSize ?? 0;

      const partial: Partial<ServerLiveState> = {};

      if (info?.info) {
        partial.info = {
          name: info.info.name || '',
          players: info.info.players || 0,
          maxPlayers: info.info.maxPlayers || 0,
          queuedPlayers: info.info.queuedPlayers || 0,
          seed: info.info.seed || 0,
          mapSize: info.info.mapSize || 0,
          wipeTime: info.info.wipeTime || 0
        };
      }

      if (time?.time) {
        partial.time = { 
          time: time.time.time || 0, 
          sunrise: time.time.sunrise || 0, 
          sunset: time.time.sunset || 0 
        };
      }

      if (team?.teamInfo) {
        const currentMapSize = partial.info?.mapSize || this.manager.state.get(this.row.id).info?.mapSize || 0;
        partial.team = (team.teamInfo.members || []).map((m: any) => ({
          steamId: String(m.steamId),
          name: m.name || 'Unknown',
          isOnline: !!m.isOnline,
          isAlive: !!m.isAlive,
          x: m.x || 0,
          y: m.y || 0,
          grid: toGrid(m.x || 0, m.y || 0, currentMapSize)
        }));
      }

      if (Object.keys(partial).length > 0) {
        this.manager.state.patch(this.row.id, partial);
      }

      this.diffMarkers((markers?.mapMarkers?.markers ?? []) as MapMarker[], partial.info?.mapSize || this.manager.state.get(this.row.id).info?.mapSize || 0);
    } catch (err) {
      // 폴링 실패는 일시적일 수 있으므로 로그만 남긴다. 연결 자체가 끊기면 disconnected 이벤트가 처리.
      console.warn(`[rust+ ${this.row.title}] poll error:`, (err as Error).message);
    }
  }

  private diffMarkers(current: MapMarker[], mapSize: number): void {
    const lang = this.manager.langFor(this.row);
    const currentMap = new Map(current.map((m) => [m.id, m]));

    if (!this.markersPrimed) {
      // 최초 폴링은 기준선만 저장 (재시작 시 기존 마커를 신규 이벤트로 오인하지 않도록)
      this.markers = currentMap;
      this.markersPrimed = true;
      return;
    }

    const fire = (type: string, marker?: MapMarker) => {
      const grid = marker ? toGrid(marker.x, marker.y, mapSize) : '';
      const message = t(`event.${type}`, { grid }, lang);
      this.manager.recordEvent(this.row, type, message);
    };

    for (const [id, m] of currentMap) {
      if (this.markers.has(id)) continue;
      if (m.type === MARKER.CARGO) fire('cargo_spawn', m);
      else if (m.type === MARKER.HELI) fire('heli_spawn', m);
      else if (m.type === MARKER.CH47) fire('ch47', m);
      else if (m.type === MARKER.CRATE) fire('crate_drop', m);
      else if (m.type === MARKER.EXPLOSION) fire('explosion', m);
    }
    for (const [id, m] of this.markers) {
      if (currentMap.has(id)) continue;
      if (m.type === MARKER.CARGO) fire('cargo_leave');
      else if (m.type === MARKER.HELI) fire('heli_leave');
      else if (m.type === MARKER.CRATE) fire('crate_gone');
    }

    this.markers = currentMap;
  }

  private handleMessage(msg: any): void {
    const broadcast = msg?.broadcast;
    if (!broadcast) return;

    if (broadcast.teamMessage?.message) {
      const m = broadcast.teamMessage.message;
      const steamId = String(m.steamId);
      // 봇(페어링 계정)이 보낸 메시지는 루프 방지를 위해 무시
      if (steamId === this.row.player_id) return;
      this.manager.hooks.onTeamMessage?.(this.row, m.name, steamId, m.message);
    }

    if (broadcast.entityChanged) {
      const entityId = String(broadcast.entityChanged.entityId);
      const value = !!broadcast.entityChanged.payload?.value;
      const device = this.manager.repos.getDeviceByEntity(this.row.id, entityId);
      if (!device) return;
      if (device.type === 'alarm') {
        if (value) this.manager.hooks.onAlarm?.(this.row, device.id, device.name);
        return;
      }
      this.manager.repos.setDeviceState(device.id, value);
      this.manager.state.publishDeviceState({ serverId: this.row.id, deviceId: device.id, entityId, state: value });
      this.manager.hooks.onDeviceState?.(this.row, device.id, entityId, value);
    }
  }
}

export class RustPlusManager {
  private sessions = new Map<number, Session>();
  hooks: ManagerHooks = {};

  constructor(
    public repos: Repositories,
    public state: StateStore
  ) {}

  langFor(row: RustServerRow): string {
    return this.repos.getGuild(row.guild_id)?.language || config.language;
  }

  recordEvent(row: RustServerRow, type: string, message: string): void {
    this.repos.logEvent(row.id, type);
    this.state.publishEvent({ serverId: row.id, type, message, at: new Date().toISOString() });
    this.hooks.onEvent?.(row, type, message);
  }

  startAll(): void {
    for (const row of this.repos.listServers()) this.connectServer(row.id);
  }

  connectServer(serverId: number): void {
    const row = this.repos.getServer(serverId);
    if (!row) return;
    this.disconnectServer(serverId);
    const session = new Session(row, this);
    this.sessions.set(serverId, session);
    session.connect();
  }

  disconnectServer(serverId: number): void {
    this.sessions.get(serverId)?.disconnect();
    this.sessions.delete(serverId);
  }

  removeServer(serverId: number): void {
    this.disconnectServer(serverId);
    this.state.remove(serverId);
    this.repos.deleteServer(serverId);
  }

  getSession(serverId: number): Session | undefined {
    return this.sessions.get(serverId);
  }

  /** 스위치 제어 — 디스코드/웹/인게임 어디서 호출해도 동일 경로 */
  async setSwitch(serverId: number, entityId: string, on: boolean): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session) throw new Error('server not connected');
    await session.setSwitchRaw(entityId, on);
    const device = this.repos.getDeviceByEntity(serverId, entityId);
    if (device) {
      this.repos.setDeviceState(device.id, on);
      this.state.publishDeviceState({ serverId, deviceId: device.id, entityId, state: on });
      const row = this.repos.getServer(serverId);
      if (row) this.hooks.onDeviceState?.(row, device.id, entityId, on);
    }
  }

  async toggleSwitch(serverId: number, entityId: string): Promise<boolean> {
    const device = this.repos.getDeviceByEntity(serverId, entityId);
    const next = !(device && device.state === 1);
    await this.setSwitch(serverId, entityId, next);
    return next;
  }

  shutdown(): void {
    for (const [, s] of this.sessions) s.disconnect();
    this.sessions.clear();
  }
}
