import { EventEmitter } from 'events';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface TeamMember {
  steamId: string;
  name: string;
  isOnline: boolean;
  isAlive: boolean;
  x: number;
  y: number;
  grid: string;
}

export interface ServerLiveState {
  serverId: number;
  status: ConnectionStatus;
  info?: {
    name: string;
    players: number;
    maxPlayers: number;
    queuedPlayers: number;
    seed: number;
    mapSize: number;
    wipeTime: number;
  };
  time?: { time: number; sunrise: number; sunset: number };
  team?: TeamMember[];
  updatedAt?: string;
}

export interface ServerEvent {
  serverId: number;
  type: string;
  message: string;
  at: string;
}

export interface DeviceStateChange {
  serverId: number;
  deviceId: number;
  entityId: string;
  state: boolean;
}

/**
 * 중앙 상태 저장소 + 이벤트 버스.
 * DiscordBridge와 Socket.IO 게이트웨이가 모두 여기를 구독하여
 * 디스코드/웹 양쪽 상태를 실시간 동기화한다.
 *
 * events:
 *  - 'server:update' (state: ServerLiveState)
 *  - 'server:event'  (event: ServerEvent)
 *  - 'device:state'  (change: DeviceStateChange)
 */
export class StateStore extends EventEmitter {
  private states = new Map<number, ServerLiveState>();

  get(serverId: number): ServerLiveState {
    let s = this.states.get(serverId);
    if (!s) {
      s = { serverId, status: 'offline' };
      this.states.set(serverId, s);
    }
    return s;
  }

  all(): ServerLiveState[] {
    return [...this.states.values()];
  }

  patch(serverId: number, partial: Partial<ServerLiveState>): ServerLiveState {
    const next = { ...this.get(serverId), ...partial, serverId, updatedAt: new Date().toISOString() };
    this.states.set(serverId, next);
    this.emit('server:update', next);
    return next;
  }

  remove(serverId: number): void {
    this.states.delete(serverId);
  }

  publishEvent(event: ServerEvent): void {
    this.emit('server:event', event);
  }

  publishDeviceState(change: DeviceStateChange): void {
    this.emit('device:state', change);
  }
}
