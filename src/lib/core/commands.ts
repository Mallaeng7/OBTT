import { t } from '../i18n';
import type { Repositories, RustServerRow } from '../db/repositories';
import type { RustPlusManager } from './rustplusManager';

const EVENT_LABEL: Record<string, string> = {
  cargo_spawn: '카고쉽',
  heli_spawn: '순찰 헬기',
  ch47: 'CH47',
  crate_drop: '잠긴 상자',
  explosion: '폭발'
};

function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}분`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 ${mins % 60}분`;
  return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
}

/** 인게임 시간(0~24 float) → "HH:MM" */
function formatGameTime(time: number): string {
  const h = Math.floor(time);
  const m = Math.floor((time - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface CommandContext {
  manager: RustPlusManager;
  repos: Repositories;
  server: RustServerRow;
  lang: string;
  reply: (text: string) => void | Promise<void>;
}

/**
 * `!명령어` 처리. 인게임 팀챗과 디스코드 릴레이 채널 양쪽에서 동일하게 사용.
 * @returns 명령어로 처리했으면 true
 */
export async function handleChatCommand(ctx: CommandContext, raw: string): Promise<boolean> {
  const input = raw.trim();
  if (!input.startsWith('!')) return false;
  const [cmd, ...rest] = input.slice(1).split(/\s+/);
  const arg = rest.join(' ').trim();
  const { manager, repos, server, lang, reply } = ctx;
  const state = manager.state.get(server.id);

  try {
    switch (cmd.toLowerCase()) {
      case 'pop': {
        const info = state.info;
        if (!info) break;
        await reply(t('cmd.pop', { players: info.players, maxPlayers: info.maxPlayers, queued: info.queuedPlayers }, lang));
        return true;
      }
      case 'time': {
        const time = state.time;
        if (!time) break;
        const isDay = time.time >= time.sunrise && time.time < time.sunset;
        // 인게임 1시간 ≈ 실제 2분(기본 45분 낮/밤 주기 근사)
        const hoursLeft = isDay ? time.sunset - time.time : (24 - time.time + time.sunrise) % 24;
        const mins = Math.max(1, Math.round(hoursLeft * 2));
        const next = t(isDay ? 'cmd.time.day' : 'cmd.time.night', { mins }, lang);
        await reply(t('cmd.time', { time: formatGameTime(time.time), next }, lang));
        return true;
      }
      case 'events': {
        const rows = repos.lastEvents(server.id).filter((r) => EVENT_LABEL[r.event_type]);
        if (rows.length === 0) {
          await reply(t('cmd.events.none', {}, lang));
          return true;
        }
        const lines = rows.map((r) =>
          t(
            'cmd.events.entry',
            { event: EVENT_LABEL[r.event_type], ago: formatDuration(Date.now() - Date.parse(r.occurred_at)) },
            lang
          )
        );
        await reply(lines.join(' | '));
        return true;
      }
      case 'team': {
        const team = state.team ?? [];
        if (team.length === 0) break;
        const lines = team.map((m) =>
          t(
            'cmd.team.entry',
            {
              status: t(m.isOnline ? 'cmd.team.online' : 'cmd.team.offline', {}, lang),
              name: m.name,
              grid: m.grid
            },
            lang
          )
        );
        await reply(lines.join(' | '));
        return true;
      }
      case 'on':
      case 'off': {
        const on = cmd.toLowerCase() === 'on';
        const device = repos.findDeviceByName(server.id, arg, 'switch');
        if (!device) {
          await reply(t('cmd.switch.notfound', { name: arg }, lang));
          return true;
        }
        await manager.setSwitch(server.id, device.entity_id, on);
        await reply(t(on ? 'cmd.switch.on' : 'cmd.switch.off', { name: device.name }, lang));
        return true;
      }
      case 'status': {
        const device = repos.findDeviceByName(server.id, arg);
        if (!device) {
          await reply(t('cmd.status.notfound', { name: arg }, lang));
          return true;
        }
        const session = manager.getSession(server.id);
        if (!session) break;
        const res = await session.getEntityInfo(device.entity_id);
        const payload = res?.entityInfo?.payload;
        if (device.type === 'storage_monitor') {
          const expiry = Number(payload?.protectionExpiry ?? 0);
          const remaining = expiry > 0 ? formatDuration(expiry * 1000 - Date.now()) : '0분';
          await reply(t('cmd.status.tc', { name: device.name, remaining }, lang));
        } else {
          await reply(
            t('cmd.status.switch', { name: device.name, state: t(payload?.value ? 'state.on' : 'state.off', {}, lang) }, lang)
          );
        }
        return true;
      }
      case 'upkeep': {
        const monitors = repos.listDevices(server.id, 'storage_monitor');
        if (monitors.length === 0) {
          await reply(t('cmd.upkeep.none', {}, lang));
          return true;
        }
        const session = manager.getSession(server.id);
        if (!session) break;
        const parts: string[] = [];
        for (const m of monitors) {
          try {
            const res = await session.getEntityInfo(m.entity_id);
            const expiry = Number(res?.entityInfo?.payload?.protectionExpiry ?? 0);
            parts.push(`${m.name}: ${expiry > 0 ? formatDuration(expiry * 1000 - Date.now()) : '-'}`);
          } catch {
            parts.push(`${m.name}: ?`);
          }
        }
        await reply(parts.join(' | '));
        return true;
      }
      case 'wipe': {
        const wipeTime = state.info?.wipeTime;
        if (!wipeTime) break;
        const days = Math.floor((Date.now() / 1000 - wipeTime) / 86400);
        await reply(t('cmd.wipe', { days }, lang));
        return true;
      }
      case 'help': {
        await reply(t('cmd.help', {}, lang));
        return true;
      }
      default:
        await reply(t('cmd.unknown', {}, lang));
        return true;
    }
    // break로 빠진 경우: 데이터 미수신 등
    await reply(t('cmd.error', {}, lang));
    return true;
  } catch (err) {
    console.error('[command]', err);
    await reply(t('cmd.error', {}, lang));
    return true;
  }
}
