/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'better-sqlite3',
    'discord.js',
    '@liamcottle/rustplus.js',
    '@liamcottle/push-receiver',
    'socket.io'
  ]
};

export default nextConfig;
