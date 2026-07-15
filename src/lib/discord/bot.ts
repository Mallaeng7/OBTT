import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  ModalSubmitInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { config } from '../config';
import { t } from '../i18n';
import { handleChatCommand } from '../core/commands';
import type { Repositories, RustServerRow, DeviceRow, GuildRow } from '../db/repositories';
import type { RustPlusManager } from '../core/rustplusManager';
import type { FcmListener } from '../core/fcmListener';

const EVENT_COLOR = 0xe08b3d;
const ALARM_COLOR = 0xd94040;
const OK_COLOR = 0x4caf50;

export class DiscordBot {
  client: Client;
  ready = false;

  constructor(
    private repos: Repositories,
    private manager: RustPlusManager,
    private fcm: FcmListener
  ) {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
    });
    this.wireHooks();
    this.wireDiscordEvents();
  }

  async start(): Promise<void> {
    if (!config.discordToken) {
      console.warn('[discord] DISCORD_TOKEN 미설정 — 봇 없이 웹만 실행합니다.');
      return;
    }
    await this.client.login(config.discordToken);
    this.ready = true;
    console.log(`[discord] logged in as ${this.client.user?.tag}`);
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  private lang(guildId: string): string {
    return this.repos.getGuild(guildId)?.language || config.language;
  }

  private guildRow(guildId: string): GuildRow {
    return this.repos.ensureGuild(guildId);
  }

  private async channel(id: string | null): Promise<TextChannel | null> {
    if (!id || !this.ready) return null;
    try {
      const ch = await this.client.channels.fetch(id);
      return ch?.type === ChannelType.GuildText ? (ch as TextChannel) : null;
    } catch {
      return null;
    }
  }

  // ── StateStore/Manager/FCM 훅 → 디스코드 반영 ─────────────────
  private wireHooks(): void {
    this.manager.hooks.onEvent = (server, _type, message) => {
      void (async () => {
        const g = this.guildRow(server.guild_id);
        const ch = await this.channel(g.events_channel_id);
        if (ch) await ch.send({ embeds: [new EmbedBuilder().setColor(EVENT_COLOR).setDescription(`**[${server.title}]** ${message}`)] });
        this.manager.getSession(server.id)?.sendTeamMessage(message);
      })().catch((e) => console.error('[discord] onEvent', e));
    };

    this.manager.hooks.onAlarm = (server, _deviceId, name) => {
      void (async () => {
        const g = this.guildRow(server.guild_id);
        const ch = await this.channel(g.alarms_channel_id);
        const msg = t('alarm.triggered', { name }, this.lang(server.guild_id));
        if (ch) await ch.send({ content: '@here', embeds: [new EmbedBuilder().setColor(ALARM_COLOR).setDescription(`**[${server.title}]** ${msg}`)] });
        this.manager.getSession(server.id)?.sendTeamMessage(msg.replaceAll('**', ''));
      })().catch((e) => console.error('[discord] onAlarm', e));
    };

    this.manager.hooks.onTeamMessage = (server, senderName, _steamId, message) => {
      void (async () => {
        const g = this.guildRow(server.guild_id);
        // 릴레이 채널로 전달
        const ch = await this.channel(g.teamchat_channel_id);
        if (ch) await ch.send(`**${senderName}**: ${message}`);
        // 인게임 명령어 처리
        if (message.trim().startsWith('!')) {
          const session = this.manager.getSession(server.id);
          await handleChatCommand(
            {
              manager: this.manager,
              repos: this.repos,
              server,
              lang: this.lang(server.guild_id),
              reply: (text) => session?.sendTeamMessage(text)
            },
            message
          );
        }
      })().catch((e) => console.error('[discord] onTeamMessage', e));
    };

    this.manager.hooks.onDeviceState = (server, deviceId) => {
      void this.updateSwitchEmbed(server, deviceId).catch((e) => console.error('[discord] updateSwitchEmbed', e));
    };

    this.manager.hooks.onStatus = (server, status) => {
      void (async () => {
        const g = this.guildRow(server.guild_id);
        const ch = await this.channel(g.events_channel_id);
        if (ch) await ch.send(t(`connection.${status}`, { title: server.title }, this.lang(server.guild_id)));
      })().catch((e) => console.error('[discord] onStatus', e));
    };

    this.fcm.hooks.onServerPaired = (server) => {
      void (async () => {
        const g = this.guildRow(server.guild_id);
        const ch = await this.channel(g.events_channel_id);
        if (ch)
          await ch.send({
            embeds: [
              new EmbedBuilder()
                .setColor(OK_COLOR)
                .setDescription(t('pair.server', { title: server.title }, this.lang(server.guild_id)))
            ]
          });
      })().catch((e) => console.error('[discord] onServerPaired', e));
    };

    this.fcm.hooks.onEntityPaired = (server, device) => {
      void (async () => {
        const g = this.guildRow(server.guild_id);
        const ch = await this.channel(g.trackers_channel_id ?? g.events_channel_id);
        if (!ch) return;
        const lang = this.lang(server.guild_id);
        await ch.send({
          embeds: [
            new EmbedBuilder().setColor(OK_COLOR).setDescription(
              t('pair.entity', { type: t(`device.${device.type}`, {}, lang), name: device.name, entityId: device.entity_id }, lang)
            )
          ]
        });
        if (device.type === 'switch') await this.postSwitchEmbed(server, device, ch);
      })().catch((e) => console.error('[discord] onEntityPaired', e));
    };

    this.fcm.hooks.onAlarmPush = (guildId, title, message) => {
      void (async () => {
        const g = this.guildRow(guildId);
        const ch = await this.channel(g.alarms_channel_id);
        if (ch)
          await ch.send({
            content: '@here',
            embeds: [new EmbedBuilder().setColor(ALARM_COLOR).setTitle(title).setDescription(message || null)]
          });
      })().catch((e) => console.error('[discord] onAlarmPush', e));
    };
  }

  // ── 스위치 제어 Embed ────────────────────────────────────────
  private switchEmbed(server: RustServerRow, device: DeviceRow) {
    const on = device.state === 1;
    const embed = new EmbedBuilder()
      .setColor(on ? OK_COLOR : 0x777777)
      .setTitle(`🔌 ${device.name}`)
      .setDescription(`서버: ${server.title}\n상태: **${on ? t('state.on') : t('state.off')}**${device.group_name ? `\n그룹: ${device.group_name}` : ''}`)
      .setFooter({ text: `entity ${device.entity_id}` });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`sw:${server.id}:${device.entity_id}:on`).setLabel('켜기').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`sw:${server.id}:${device.entity_id}:off`).setLabel('끄기').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`sw:${server.id}:${device.entity_id}:toggle`).setLabel('토글').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  async postSwitchEmbed(server: RustServerRow, device: DeviceRow, channel: TextChannel): Promise<void> {
    const msg = await channel.send(this.switchEmbed(server, device));
    this.repos.setDeviceControlMessage(device.id, channel.id, msg.id);
  }

  /** 웹/인게임에서 상태가 바뀌어도 디스코드 Embed를 동기화 */
  async updateSwitchEmbed(server: RustServerRow, deviceId: number): Promise<void> {
    const device = this.repos.getDevice(deviceId);
    if (!device || !device.control_channel_id || !device.control_message_id) return;
    const ch = await this.channel(device.control_channel_id);
    if (!ch) return;
    try {
      const msg = await ch.messages.fetch(device.control_message_id);
      await msg.edit(this.switchEmbed(server, device));
    } catch {
      /* 메시지 삭제됨 등 — 무시 */
    }
  }

  // ── 디스코드 이벤트 ──────────────────────────────────────────
  private wireDiscordEvents(): void {
    this.client.on('interactionCreate', (interaction) => {
      void (async () => {
        try {
          if (interaction.isChatInputCommand()) await this.handleSlash(interaction);
          else if (interaction.isButton()) await this.handleButton(interaction);
          else if (interaction.isModalSubmit()) await this.handleModal(interaction);
        } catch (err) {
          console.error('[discord] interaction error', err);
          if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '처리 중 오류가 발생했습니다.', ephemeral: true }).catch(() => {});
          }
        }
      })();
    });

    this.client.on('messageCreate', (message) => {
      void (async () => {
        try {
          if (message.author.bot || !message.guildId) return;
          const g = this.repos.getGuild(message.guildId);
          if (!g || message.channelId !== g.teamchat_channel_id) return;
          const server = this.repos.getActiveServer(message.guildId);
          if (!server) return;
          const session = this.manager.getSession(server.id);

          if (message.content.trim().startsWith('!')) {
            await handleChatCommand(
              {
                manager: this.manager,
                repos: this.repos,
                server,
                lang: this.lang(message.guildId),
                reply: async (text) => {
                  await message.channel.send(text);
                }
              },
              message.content
            );
            return;
          }
          // 디스코드 → 인게임 릴레이
          session?.sendTeamMessage(`[D] ${message.member?.displayName ?? message.author.username}: ${message.content}`);
        } catch (err) {
          console.error('[discord] messageCreate error', err);
        }
      })();
    });
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    const [kind, serverIdRaw, entityId, action] = interaction.customId.split(':');
    if (kind !== 'sw') return;
    const serverId = Number(serverIdRaw);
    const server = this.repos.getServer(serverId);
    if (!server) {
      await interaction.reply({ content: t('slash.server.notfound'), ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    try {
      if (action === 'toggle') await this.manager.toggleSwitch(serverId, entityId);
      else await this.manager.setSwitch(serverId, entityId, action === 'on');
      const device = this.repos.getDeviceByEntity(serverId, entityId);
      if (device) await interaction.editReply(this.switchEmbed(server, device));
    } catch {
      await interaction.followUp({ content: '서버가 오프라인이거나 Rust+ 연결이 끊어졌습니다.', ephemeral: true }).catch(() => {});
    }
  }

  private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    if (interaction.customId !== 'credentials-modal' || !interaction.guildId) return;
    const raw = interaction.fields.getTextInputValue('credentials-json');
    const lang = this.lang(interaction.guildId);
    try {
      JSON.parse(raw);
    } catch {
      await interaction.reply({ content: t('slash.credentials.invalid', {}, lang), ephemeral: true });
      return;
    }
    this.guildRow(interaction.guildId);
    this.repos.setCredentials(interaction.user.id, interaction.guildId, raw);
    await this.fcm.start(interaction.user.id);
    await interaction.reply({ content: t('slash.credentials.saved', {}, lang), ephemeral: true });
  }

  private async handleSlash(i: ChatInputCommandInteraction): Promise<void> {
    if (!i.guildId) {
      await i.reply({ content: '서버(길드) 안에서만 사용할 수 있습니다.', ephemeral: true });
      return;
    }
    const guildId = i.guildId;
    const lang = this.lang(guildId);

    switch (i.commandName) {
      case 'setup': {
        await i.deferReply({ ephemeral: true });
        const guild = await this.client.guilds.fetch(guildId);
        const category = await guild.channels.create({ name: 'OBTT', type: ChannelType.GuildCategory });
        const mk = (name: string) => guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id });
        const [events, alarms, teamchat, trackers] = await Promise.all([mk('이벤트'), mk('알람'), mk('팀챗'), mk('기기')]);
        this.repos.updateGuildChannels(guildId, {
          events_channel_id: events.id,
          alarms_channel_id: alarms.id,
          teamchat_channel_id: teamchat.id,
          trackers_channel_id: trackers.id
        });
        await i.editReply(t('slash.setup.done', {}, lang));
        return;
      }

      case 'credentials': {
        if (i.options.getSubcommand() === 'set') {
          const modal = new ModalBuilder().setCustomId('credentials-modal').setTitle('Rust+ 크리덴셜 등록');
          const input = new TextInputBuilder()
            .setCustomId('credentials-json')
            .setLabel('크리덴셜 JSON 붙여넣기')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
          await i.showModal(modal);
        } else {
          this.fcm.stop(i.user.id);
          this.repos.removeCredentials(i.user.id);
          await i.reply({ content: t('slash.credentials.removed', {}, lang), ephemeral: true });
        }
        return;
      }

      case 'server': {
        const sub = i.options.getSubcommand();
        if (sub === 'list') {
          const servers = this.repos.listServers(guildId);
          if (servers.length === 0) {
            await i.reply({ content: t('slash.server.none', {}, lang), ephemeral: true });
            return;
          }
          const lines = servers.map((s) => {
            const st = this.manager.state.get(s.id).status;
            const dot = st === 'online' ? '🟢' : st === 'connecting' ? '🟡' : '🔴';
            return `\`${s.id}\` ${dot} **${s.title}** (${s.ip}:${s.port})${s.is_active ? ' ⭐활성' : ''}`;
          });
          await i.reply({ content: lines.join('\n'), ephemeral: true });
          return;
        }
        const id = i.options.getInteger('id', true);
        const server = this.repos.getServer(id);
        if (!server || server.guild_id !== guildId) {
          await i.reply({ content: t('slash.server.notfound', {}, lang), ephemeral: true });
          return;
        }
        if (sub === 'active') {
          this.repos.setActiveServer(guildId, id);
          await i.reply({ content: t('slash.server.active', { title: server.title }, lang), ephemeral: true });
        } else if (sub === 'connect') {
          this.manager.connectServer(id);
          await i.reply({ content: t('slash.server.connected', { title: server.title }, lang), ephemeral: true });
        } else if (sub === 'disconnect') {
          this.manager.disconnectServer(id);
          await i.reply({ content: t('slash.server.disconnected', { title: server.title }, lang), ephemeral: true });
        } else if (sub === 'remove') {
          this.manager.removeServer(id);
          await i.reply({ content: t('slash.server.disconnected', { title: server.title }, lang), ephemeral: true });
        }
        return;
      }

      case 'switch':
      case 'alarm': {
        const sub = i.options.getSubcommand();
        const entity = i.options.getString('entity', true);
        const server = this.repos.getActiveServer(guildId);
        const device = server ? this.repos.getDeviceByEntity(server.id, entity) : undefined;
        if (!device) {
          await i.reply({ content: t('slash.device.notfound', {}, lang), ephemeral: true });
          return;
        }
        if (sub === 'rename') {
          const name = i.options.getString('name', true);
          this.repos.renameDevice(device.id, name);
          if (server && device.type === 'switch') await this.updateSwitchEmbed(server, device.id);
          await i.reply({ content: t('slash.device.renamed', { name }, lang), ephemeral: true });
        } else if (sub === 'group') {
          const group = i.options.getString('group', true);
          this.repos.setDeviceGroup(device.id, group);
          await i.reply({ content: t('slash.device.grouped', { group }, lang), ephemeral: true });
        } else if (sub === 'remove') {
          this.repos.deleteDevice(device.id);
          await i.reply({ content: t('slash.device.removed', {}, lang), ephemeral: true });
        }
        return;
      }

      case 'dashboard': {
        await i.reply({ content: t('slash.dashboard', { url: config.webBaseUrl }, lang), ephemeral: true });
        return;
      }

      case 'link': {
        const code = this.repos.createLinkCode(i.user.id);
        await i.reply({ content: t('slash.link.code', { code }, lang), ephemeral: true });
        return;
      }

      case 'language': {
        const langCode = i.options.getString('lang', true);
        this.repos.setGuildLanguage(guildId, langCode);
        await i.reply({ content: t('slash.language.set', { lang: langCode }, langCode), ephemeral: true });
        return;
      }

      case 'help': {
        await i.reply({ content: t('slash.help', {}, lang), ephemeral: true });
        return;
      }
    }
  }
}
