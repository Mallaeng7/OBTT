import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

/** 슬래시 명령어 정의 — 봇 핸들러와 register-commands 스크립트가 공유 */
export function buildSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('알림/팀챗/트래커 채널을 자동 생성하고 지정합니다')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName('credentials')
      .setDescription('Rust+ 크리덴셜 관리')
      .addSubcommand((s) => s.setName('set').setDescription('FCM 크리덴셜 등록 (모달에 JSON 붙여넣기)'))
      .addSubcommand((s) => s.setName('remove').setDescription('내 크리덴셜 삭제')),

    new SlashCommandBuilder()
      .setName('server')
      .setDescription('러스트 서버 관리 (다중 서버)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('list').setDescription('등록된 서버 목록'))
      .addSubcommand((s) =>
        s
          .setName('active')
          .setDescription('명령어 대상 서버 지정')
          .addIntegerOption((o) => o.setName('id').setDescription('서버 ID (/server list 참고)').setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName('connect')
          .setDescription('서버 연결 시작')
          .addIntegerOption((o) => o.setName('id').setDescription('서버 ID').setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName('disconnect')
          .setDescription('서버 연결 해제')
          .addIntegerOption((o) => o.setName('id').setDescription('서버 ID').setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName('remove')
          .setDescription('서버 등록 삭제')
          .addIntegerOption((o) => o.setName('id').setDescription('서버 ID').setRequired(true))
      ),

    new SlashCommandBuilder()
      .setName('switch')
      .setDescription('스마트 스위치 관리')
      .addSubcommand((s) =>
        s
          .setName('rename')
          .setDescription('스위치 이름 변경')
          .addStringOption((o) => o.setName('entity').setDescription('엔티티 ID').setRequired(true))
          .addStringOption((o) => o.setName('name').setDescription('새 이름').setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName('group')
          .setDescription('스위치 그룹 지정')
          .addStringOption((o) => o.setName('entity').setDescription('엔티티 ID').setRequired(true))
          .addStringOption((o) => o.setName('group').setDescription('그룹 이름').setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName('remove')
          .setDescription('스위치 삭제')
          .addStringOption((o) => o.setName('entity').setDescription('엔티티 ID').setRequired(true))
      ),

    new SlashCommandBuilder()
      .setName('alarm')
      .setDescription('스마트 알람 관리')
      .addSubcommand((s) =>
        s
          .setName('rename')
          .setDescription('알람 이름 변경')
          .addStringOption((o) => o.setName('entity').setDescription('엔티티 ID').setRequired(true))
          .addStringOption((o) => o.setName('name').setDescription('새 이름').setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName('remove')
          .setDescription('알람 삭제')
          .addStringOption((o) => o.setName('entity').setDescription('엔티티 ID').setRequired(true))
      ),

    new SlashCommandBuilder().setName('dashboard').setDescription('웹 대시보드 링크 안내'),

    new SlashCommandBuilder().setName('link').setDescription('웹 대시보드(스팀 계정) 연동 코드 발급'),

    new SlashCommandBuilder()
      .setName('language')
      .setDescription('봇 출력 언어 변경')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName('lang').setDescription('언어 코드 (예: ko, en)').setRequired(true)),

    new SlashCommandBuilder().setName('help').setDescription('명령어 도움말')
  ].map((c) => c.toJSON());
}
