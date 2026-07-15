import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { buildSlashCommands } from '../src/lib/discord/slashDefs';

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!token || !clientId) {
    console.error('DISCORD_TOKEN / DISCORD_CLIENT_ID 를 .env 에 설정하세요.');
    process.exit(1);
  }
  const rest = new REST({ version: '10' }).setToken(token);
  const commands = buildSlashCommands();
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(`슬래시 명령어 ${commands.length}개 등록 완료.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
