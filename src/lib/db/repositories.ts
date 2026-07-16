import type { Database } from 'better-sqlite3';

export type Role = 'admin' | 'manager' | 'viewer';

export interface UserRow {
  steam_id: string;
  persona_name: string;
  avatar: string;
  role: Role;
  linked_discord_id: string | null;
  first_login_at: string;
  last_login_at: string;
}

export interface GuildRow {
  guild_id: string;
  language: string;
  events_channel_id: string | null;
  alarms_channel_id: string | null;
  teamchat_channel_id: string | null;
  trackers_channel_id: string | null;
}

export interface RustServerRow {
  id: number;
  guild_id: string;
  title: string;
  ip: string;
  port: number;
  player_id: string;
  player_token: string;
  is_active: number;
  events_enabled: number;
}

export type DeviceType = 'switch' | 'alarm' | 'storage_monitor';

export interface DeviceRow {
  id: number;
  server_id: number;
  entity_id: string;
  type: DeviceType;
  name: string;
  group_name: string | null;
  state: number;
  control_channel_id: string | null;
  control_message_id: string | null;
}

export interface CredentialsRow {
  discord_user_id: string;
  guild_id: string;
  fcm_credentials: string;
  updated_at: string;
}

export interface EventLogRow {
  id: number;
  server_id: number;
  event_type: string;
  occurred_at: string;
}

export class Repositories {
  constructor(private db: Database) {}

  // ── users ──────────────────────────────────────────
  upsertUser(steamId: string, personaName: string, avatar: string, defaultRole: Role): UserRow {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO users (steam_id, persona_name, avatar, role, first_login_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(steam_id) DO UPDATE SET persona_name = excluded.persona_name,
           avatar = excluded.avatar, last_login_at = excluded.last_login_at`
      )
      .run(steamId, personaName, avatar, defaultRole, now, now);
    return this.getUser(steamId)!;
  }

  getUser(steamId: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE steam_id = ?').get(steamId) as UserRow | undefined;
  }

  listUsers(): UserRow[] {
    return this.db.prepare('SELECT * FROM users ORDER BY first_login_at').all() as UserRow[];
  }

  setUserRole(steamId: string, role: Role): void {
    this.db.prepare('UPDATE users SET role = ? WHERE steam_id = ?').run(role, steamId);
  }

  linkDiscord(steamId: string, discordUserId: string): void {
    this.db.prepare('UPDATE users SET linked_discord_id = ? WHERE steam_id = ?').run(discordUserId, steamId);
  }

  // ── guilds ─────────────────────────────────────────
  ensureGuild(guildId: string): GuildRow {
    this.db.prepare('INSERT OR IGNORE INTO guilds (guild_id) VALUES (?)').run(guildId);
    return this.getGuild(guildId)!;
  }

  getGuild(guildId: string): GuildRow | undefined {
    return this.db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId) as GuildRow | undefined;
  }

  updateGuildChannels(guildId: string, channels: Partial<Omit<GuildRow, 'guild_id' | 'language'>>): void {
    const g = this.ensureGuild(guildId);
    this.db
      .prepare(
        `UPDATE guilds SET events_channel_id = ?, alarms_channel_id = ?, teamchat_channel_id = ?, trackers_channel_id = ?
         WHERE guild_id = ?`
      )
      .run(
        channels.events_channel_id ?? g.events_channel_id,
        channels.alarms_channel_id ?? g.alarms_channel_id,
        channels.teamchat_channel_id ?? g.teamchat_channel_id,
        channels.trackers_channel_id ?? g.trackers_channel_id,
        guildId
      );
  }

  setGuildLanguage(guildId: string, language: string): void {
    this.ensureGuild(guildId);
    this.db.prepare('UPDATE guilds SET language = ? WHERE guild_id = ?').run(language, guildId);
  }

  // ── rust servers ───────────────────────────────────
  upsertServer(row: Omit<RustServerRow, 'id' | 'is_active' | 'events_enabled'>): RustServerRow {
    const existing = this.db
      .prepare('SELECT * FROM rust_servers WHERE guild_id = ? AND ip = ? AND port = ?')
      .get(row.guild_id, row.ip, row.port) as RustServerRow | undefined;
    if (existing) {
      this.db
        .prepare('UPDATE rust_servers SET title = ?, player_id = ?, player_token = ? WHERE id = ?')
        .run(row.title, row.player_id, row.player_token, existing.id);
      return this.getServer(existing.id)!;
    }
    const count = this.db
      .prepare('SELECT COUNT(*) AS c FROM rust_servers WHERE guild_id = ?')
      .get(row.guild_id) as { c: number };
    const info = this.db
      .prepare(
        `INSERT INTO rust_servers (guild_id, title, ip, port, player_id, player_token, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(row.guild_id, row.title, row.ip, row.port, row.player_id, row.player_token, count.c === 0 ? 1 : 0);
    return this.getServer(Number(info.lastInsertRowid))!;
  }

  getServer(id: number): RustServerRow | undefined {
    return this.db.prepare('SELECT * FROM rust_servers WHERE id = ?').get(id) as RustServerRow | undefined;
  }

  listServers(guildId?: string): RustServerRow[] {
    if (guildId) {
      return this.db.prepare('SELECT * FROM rust_servers WHERE guild_id = ? ORDER BY id').all(guildId) as RustServerRow[];
    }
    return this.db.prepare('SELECT * FROM rust_servers ORDER BY id').all() as RustServerRow[];
  }

  getActiveServer(guildId: string): RustServerRow | undefined {
    return this.db
      .prepare('SELECT * FROM rust_servers WHERE guild_id = ? AND is_active = 1')
      .get(guildId) as RustServerRow | undefined;
  }

  setActiveServer(guildId: string, serverId: number): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE rust_servers SET is_active = 0 WHERE guild_id = ?').run(guildId);
      this.db.prepare('UPDATE rust_servers SET is_active = 1 WHERE id = ? AND guild_id = ?').run(serverId, guildId);
    });
    tx();
  }

  deleteServer(id: number): void {
    this.db.prepare('DELETE FROM rust_servers WHERE id = ?').run(id);
  }

  setEventsEnabled(id: number, enabled: boolean): void {
    this.db.prepare('UPDATE rust_servers SET events_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  }

  // ── devices ────────────────────────────────────────
  upsertDevice(serverId: number, entityId: string, type: DeviceType, name: string): DeviceRow {
    this.db
      .prepare(
        `INSERT INTO devices (server_id, entity_id, type, name)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(server_id, entity_id) DO UPDATE SET name = excluded.name, type = excluded.type`
      )
      .run(serverId, entityId, type, name);
    return this.getDeviceByEntity(serverId, entityId)!;
  }

  getDevice(id: number): DeviceRow | undefined {
    return this.db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as DeviceRow | undefined;
  }

  getDeviceByEntity(serverId: number, entityId: string): DeviceRow | undefined {
    return this.db
      .prepare('SELECT * FROM devices WHERE server_id = ? AND entity_id = ?')
      .get(serverId, entityId) as DeviceRow | undefined;
  }

  findDeviceByName(serverId: number, name: string, type?: DeviceType): DeviceRow | undefined {
    if (type) {
      return this.db
        .prepare('SELECT * FROM devices WHERE server_id = ? AND type = ? AND LOWER(name) = LOWER(?)')
        .get(serverId, type, name) as DeviceRow | undefined;
    }
    return this.db
      .prepare('SELECT * FROM devices WHERE server_id = ? AND LOWER(name) = LOWER(?)')
      .get(serverId, name) as DeviceRow | undefined;
  }

  listDevices(serverId: number, type?: DeviceType): DeviceRow[] {
    if (type) {
      return this.db
        .prepare('SELECT * FROM devices WHERE server_id = ? AND type = ? ORDER BY name')
        .all(serverId, type) as DeviceRow[];
    }
    return this.db.prepare('SELECT * FROM devices WHERE server_id = ? ORDER BY type, name').all(serverId) as DeviceRow[];
  }

  renameDevice(id: number, name: string): void {
    this.db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name, id);
  }

  setDeviceGroup(id: number, group: string | null): void {
    this.db.prepare('UPDATE devices SET group_name = ? WHERE id = ?').run(group, id);
  }

  setDeviceState(id: number, state: boolean): void {
    this.db.prepare('UPDATE devices SET state = ? WHERE id = ?').run(state ? 1 : 0, id);
  }

  setDeviceControlMessage(id: number, channelId: string, messageId: string): void {
    this.db
      .prepare('UPDATE devices SET control_channel_id = ?, control_message_id = ? WHERE id = ?')
      .run(channelId, messageId, id);
  }

  deleteDevice(id: number): void {
    this.db.prepare('DELETE FROM devices WHERE id = ?').run(id);
  }

  // ── credentials ────────────────────────────────────
  setCredentials(discordUserId: string, guildId: string, fcmCredentials: string): void {
    this.db
      .prepare(
        `INSERT INTO credentials (discord_user_id, guild_id, fcm_credentials, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(discord_user_id) DO UPDATE SET guild_id = excluded.guild_id,
           fcm_credentials = excluded.fcm_credentials, updated_at = excluded.updated_at`
      )
      .run(discordUserId, guildId, fcmCredentials, new Date().toISOString());
  }

  getCredentials(discordUserId: string): CredentialsRow | undefined {
    return this.db
      .prepare('SELECT * FROM credentials WHERE discord_user_id = ?')
      .get(discordUserId) as CredentialsRow | undefined;
  }

  listCredentials(): CredentialsRow[] {
    return this.db.prepare('SELECT * FROM credentials').all() as CredentialsRow[];
  }

  removeCredentials(discordUserId: string): void {
    this.db.prepare('DELETE FROM credentials WHERE discord_user_id = ?').run(discordUserId);
  }

  // ── event log ──────────────────────────────────────
  logEvent(serverId: number, eventType: string): void {
    this.db
      .prepare('INSERT INTO event_log (server_id, event_type, occurred_at) VALUES (?, ?, ?)')
      .run(serverId, eventType, new Date().toISOString());
  }

  lastEvents(serverId: number): { event_type: string; occurred_at: string }[] {
    return this.db
      .prepare(
        `SELECT event_type, MAX(occurred_at) AS occurred_at FROM event_log
         WHERE server_id = ? GROUP BY event_type ORDER BY occurred_at DESC`
      )
      .all(serverId) as { event_type: string; occurred_at: string }[];
  }

  recentEvents(serverId: number, limit = 30): EventLogRow[] {
    return this.db
      .prepare('SELECT * FROM event_log WHERE server_id = ? ORDER BY id DESC LIMIT ?')
      .all(serverId, limit) as EventLogRow[];
  }

  // ── link codes ─────────────────────────────────────
  createLinkCode(discordUserId: string): string {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    this.db
      .prepare('INSERT OR REPLACE INTO link_codes (code, discord_user_id, expires_at) VALUES (?, ?, ?)')
      .run(code, discordUserId, expires);
    return code;
  }

  consumeLinkCode(code: string): string | undefined {
    const row = this.db
      .prepare('SELECT * FROM link_codes WHERE code = ? AND expires_at > ?')
      .get(code.toUpperCase(), new Date().toISOString()) as { discord_user_id: string } | undefined;
    if (!row) return undefined;
    this.db.prepare('DELETE FROM link_codes WHERE code = ?').run(code.toUpperCase());
    return row.discord_user_id;
  }
}
