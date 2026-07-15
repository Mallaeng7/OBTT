const base = process.env.WEB_BASE_URL || 'http://localhost:3000';

export const config = {
  discordToken: process.env.DISCORD_TOKEN || '',
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  webBaseUrl: base,
  port: parseInt(process.env.PORT || '3000', 10),
  steamApiKey: process.env.STEAM_API_KEY || '',
  steamReturnUrl: process.env.STEAM_RETURN_URL || `${base}/api/auth/steam/return`,
  sessionSecret: process.env.SESSION_SECRET || 'obtt-dev-secret-change-me-in-production!!',
  adminSteamIds: (process.env.ADMIN_STEAM_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  language: process.env.LANGUAGE || 'ko',
  pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '10000', 10),
  databasePath: process.env.DATABASE_PATH || 'data/obtt.db'
};
