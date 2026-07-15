import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS users (
  steam_id TEXT PRIMARY KEY,
  persona_name TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'viewer',
  linked_discord_id TEXT,
  first_login_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_guilds (
  steam_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  PRIMARY KEY (steam_id, guild_id)
);
CREATE TABLE IF NOT EXISTS guilds (
  guild_id TEXT PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'ko',
  events_channel_id TEXT,
  alarms_channel_id TEXT,
  teamchat_channel_id TEXT,
  trackers_channel_id TEXT
);
CREATE TABLE IF NOT EXISTS rust_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  title TEXT NOT NULL,
  ip TEXT NOT NULL,
  port INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  player_token TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  UNIQUE (guild_id, ip, port)
);
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES rust_servers(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  group_name TEXT,
  state INTEGER NOT NULL DEFAULT 0,
  control_channel_id TEXT,
  control_message_id TEXT,
  UNIQUE (server_id, entity_id)
);
CREATE TABLE IF NOT EXISTS credentials (
  discord_user_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  fcm_credentials TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tracked_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES rust_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  battlemetrics_id TEXT
);
CREATE TABLE IF NOT EXISTS vending_watch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES rust_servers(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES rust_servers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS link_codes (
  code TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_log_server ON event_log (server_id, event_type, occurred_at);
`;

export function openDatabase(): Database.Database {
  const dbPath = path.resolve(process.cwd(), config.databasePath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(MIGRATIONS);
  return db;
}
