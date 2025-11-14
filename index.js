// index.js
// Fully integrated bot: automatic command registration + handlers for
// apply-panel (forum posts & threads), embed, audit, blacklist (ЧС),
// modals, accept/deny buttons, leader logs.
// Requires: discord.js v14, @discordjs/rest, discord-api-types, dotenv
import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import express from 'express';

import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} from 'discord.js';

// --------------------------- ENV ---------------------------
const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  APP_CHANNEL_ID,         // forum channel id for applications (forum)
  AUDIT_CHANNEL_ID,       // audit logs channel id
  LEADERS_LOG_CHANNEL_ID, // leaders logs channel id
  BLACKLIST_CHANNEL_ID,   // blacklist channel id
  ALLOWED_ROLES           // comma-separated role ids that receive mentions / can use panel
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing required env vars: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

const ALLOWED_ROLE_IDS = (ALLOWED_ROLES || '').split(',').map(s => s.trim()).filter(Boolean);

// ---------------------- COMMANDS DEFINITION ----------------------
const commandsDef = [
  new SlashCommandBuilder().setName('apply-panel').setDescription('Опубликовать панель заявок'),
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Создать эмбэд')
    .addStringOption(o => o.setName('title').setDescription('Заголовок').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Текст').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Цвет hex (#rrggbb)').setRequired(false)),
  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Записать действие лидера (лог)')
    .addUserOption(o => o.setName('author').setDescription('Кто совершил действие').setRequired(true))
    .addUserOption(o => o.setName('target').setDescription('Кого касается').setRequired(true))
    .addStringOption(o => o.setName('action').setDescription('Тип действия').setRequired(true)
      .addChoices(
        { name: 'Повышение', value: 'promote' },
        { name: 'Понижение', value: 'demote' },
        { name: 'Выговор', value: 'warn' },
        { name: 'Увольнение', value: 'fire' },
        { name: 'Выдача ранга', value: 'give_rank' }
      ))
    .addStringOption(o => o.setName('from_rank').setDescription('С какого ранга').setRequired(false)
      .addChoices(
        { name: '8 — Generalisimus', value: '8' },
        { name: '7 — Vice Gen.', value: '7' },
        { name: '6 — Gen. Secretary', value: '6' },
        { name: '5 — Curator', value: '5' },
        { name: "4 — Curator's Office", value: '4' },
        { name: '3 — Stacked', value: '3' },
        { name: '2 — Main', value: '2' },
        { name: '1 — NewBie', value: '1' }
      ))
    .addStringOption(o => o.setName('to_rank').setDescription('На какой ранг').setRequired(false)
      .addChoices(
        { name: '8 — Generalisimus', value: '8' },
        { name: '7 — Vice Gen.', value: '7' },
        { name: '6 — Gen. Secretary', value: '6' },
        { name: '5 — Curator', value: '5' },
        { name: "4 — Curator's Office", value: '4' },
        { name: '3 — Stacked', value: '3' },
        { name: '2 — Main', value: '2' },
        { name: '1 — NewBie', value: '1' }
      ))
    .addStringOption(o => o.setName('reason').setDescription('Причина / описание').setRequired(false)),
  new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Управление ЧС (blacklist)')
    .addSubcommand(sc => sc.setName('add').setDescription('Добавить в ЧС')
      .addStringOption(o => o.setName('static').setDescription('Статик (например Family #1234)').setRequired(true))
      .addUserOption(o => o.setName('member').setDescription('Пользователь (опционально)').setRequired(false))
      .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Срок, e.g. 30d или forever').setRequired(false)))
    .addSubcommand(sc => sc.setName('remove').setDescription('Удалить из ЧС')
      .addStringOption(o => o.setName('static').setDescription('Статик (по которому искать)').setRequired(false))
      .addStringOption(o => o.setName('message_id').setDescription('ID сообщения в канале ЧС').setRequired(false)))
    .addSubcommand(sc => sc.setName('list').setDescription('Показать последние записи ЧС')
      .addIntegerOption(o => o.setName('limit').setDescription('Сколько записей показать (max 25)').setRequired(false)))
];

const commandsJSON = commandsDef.map(c => c.toJSON());

// ---------------------- REGISTER COMMANDS (GUILD) ----------------------
(async () => {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    console.log('Registering slash commands to guild', GUILD_ID);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commandsJSON });
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
})();

// ---------------------- CLIENT ----------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message]
});

client.once(Events.ClientReady, () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

// ---------------------- INTERACTIONS ----------------------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Chat input commands
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      // apply-panel: post a panel with buttons
      if (cmd === 'apply-panel') {
        // permission optional: allow only roles with ManageGuild or roles from ALLOWED_ROLE_IDS
        const embed = new EmbedBuilder()
          .setTitle('✉️ Панель заявок')
          .setDescription('Выберите тип заявки и нажмите кнопку.')
          .setColor(0x8e44ad);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('apply_family').setLabel('Вступление').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('apply_restore').setLabel('Восстановление').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('apply_unblack').setLabel('Снятие ЧС').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }

      // embed command
      if (cmd === 'embed') {
        const title = interaction.options.getString('title', true);
        const description = interaction.options.getString('description', true);
        const color = interaction.options.getString('color') || '#7b68ee';
        const e = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
        await interaction.reply({ embeds: [e] });
        return;
      }

      // audit command
      if (cmd === 'audit') {
        const author = interaction.options.getUser('author', true);
        const target = interaction.options.getUser('target', true);
        const action = interaction.options.getString('action', true);
        const fromRank = interaction.options.getString('from_rank') || '—';
        const toRank = interaction.options.getString('to_rank') || '—';
        const reason = interaction.options.getString('reason') || '—';

        const map = { promote: 'Повышение', demote: 'Понижение', warn: 'Выговор', fire: 'Увольнение', give_rank: 'Выдача ранга' };
        const emb = new EmbedBuilder()
          .setTitle('📝 Аудит — запись действия')
          .setColor(0xf1c40f)
          .addFields(
            { name: 'Действие', value: map[action] || action, inline: true },
            { name: 'Кто', value: `<@${author.id}>`, inline: true },
            { name: 'Кого', value: `<@${target.id}>`, inline: true },
            { name: 'С ранга', value: fromRank, inline: true },
            { name: 'В ранг', value: toRank, inline: true },
            { name: 'Причина', value: reason, inline: false }
          )
          .setTimestamp();

        if (!AUDIT_CHANNEL_ID) {
          await interaction.reply({ content: 'AUDIT_CHANNEL_ID not set.', ephemeral: true });
          return;
        }
        const ch = await client.channels.fetch(AUDIT_CHANNEL_ID).catch(() => null);
        if (!ch || !ch.isTextBased()) {
          await interaction.reply({ content: 'Cannot find audit channel or no access.', ephemeral: true });
          return;
        }
        await ch.send({ embeds: [emb] }).catch(() => {});
        await interaction.reply({ content: 'Audit recorded.', ephemeral: true });
        return;
      }

      // blacklist command (subcommands add/remove/list)
      if (cmd === 'blacklist') {
        // permission check: manageGuild or role in ALLOWED_ROLE_IDS
        let allowed = false;
        try {
          if (interaction.memberPermissions?.has('ManageGuild')) allowed = true;
          if (!allowed && ALLOWED_ROLE_IDS.length) {
            const roles = interaction.member?.roles?.cache?.map(r => r.id) || [];
            allowed = roles.some(r => ALLOWED_ROLE_IDS.includes(r));
          }
        } catch (e) { /* ignore */ }

        if (!allowed) {
          await interaction.reply({ content: 'У вас нет прав для работы с ЧС.', ephemeral: true });
          return;
        }

        const sub = interaction.options.getSubcommand();
        if (!BLACKLIST_CHANNEL_ID) {
          await interaction.reply({ content: 'BLACKLIST_CHANNEL_ID not set.', ephemeral: true });
          return;
        }
        const blCh = await client.channels.fetch(BLACKLIST_CHANNEL_ID).catch(() => null);
        if (!blCh || !blCh.isTextBased()) {
          await interaction.reply({ content: 'Cannot access blacklist channel.', ephemeral: true });
          return;
        }

        if (sub === 'add') {
          const staticText = interaction.options.getString('static', true);
          const user = interaction.options.getUser('member', false);
          const reason = interaction.options.getString('reason', true);
          const duration = interaction.options.getString('duration') || '—';

          const emb = new EmbedBuilder()
            .setTitle('⛔ Blacklist Entry')
            .addFields(
              { name: 'Статик', value: staticText, inline: true },
              { name: 'Пользователь', value: user ? `<@${user.id}>` : '—', inline: true },
              { name: 'Причина', value: reason },
              { name: 'Срок', value: duration, inline: true },
              { name: 'Добавил', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp()
            .setColor(0xe74c3c);

          const sent = await blCh.send({ embeds: [emb] }).catch(err => { console.error('BL send error', err); return null; });
          if (!sent) {
            await interaction.reply({ content: 'Failed to add to blacklist.', ephemeral: true });
            return;
          }
          await interaction.reply({ content: `Added to blacklist: ${staticText}\n${sent.url}`, ephemeral: true });
          return;
        }

        if (sub === 'remove') {
          const messageId = interaction.options.getString('message_id');
          const staticText = interaction.options.getString('static');

          if (messageId) {
            try {
              const msg = await blCh.messages.fetch(messageId);
              await msg.delete();
              await interaction.reply({ content: `Removed entry (id: ${messageId}).`, ephemeral: true });
              return;
            } catch (e) {
              await interaction.reply({ content: `Cannot find/delete message id ${messageId}.`, ephemeral: true });
              return;
            }
          }

          if (staticText) {
            const fetched = await blCh.messages.fetch({ limit: 100 }).catch(() => null);
            if (!fetched) {
              await interaction.reply({ content: 'Failed to fetch blacklist messages.', ephemeral: true });
              return;
            }
            const found = fetched.find(m => {
              const e = m.embeds[0];
              if (!e) return false;
              const f = e.fields?.find(ff => ff.name === 'Статик' || ff.name === 'Статик');
              return f && f.value && f.value.toLowerCase().includes(staticText.toLowerCase());
            });
            if (!found) {
              await interaction.reply({ content: 'No entry found with that static.', ephemeral: true });
              return;
            }
            await found.delete().catch(() => {});
            await interaction.reply({ content: `Removed entry for "${staticText}".`, ephemeral: true });
            return;
          }

          await interaction.reply({ content: 'Provide message_id or static to remove.', ephemeral: true });
          return;
        }

        if (sub === 'list') {
          const limit = Math.min(interaction.options.getInteger('limit') || 10, 25);
          const fetched = await blCh.messages.fetch({ limit }).catch(() => null);
          if (!fetched) {
            await interaction.reply({ content: 'Failed to fetch blacklist entries.', ephemeral: true });
            return;
          }
          const lines = fetched.map(m => {
            const e = m.embeds[0];
            if (!e) return `${m.id} — (no embed)`;
            const s = e.fields?.find(f => f.name === 'Статик')?.value || '—';
            const r = e.fields?.find(f => f.name === 'Причина')?.value || '—';
            const d = e.fields?.find(f => f.name === 'Срок')?.value || '—';
            return `• ${s} | ${r} | ${d} — ${m.url}`;
          }).slice(0, limit);
          if (!lines.length) {
            await interaction.reply({ content: 'Blacklist is empty.', ephemeral: true });
            return;
          }
          await interaction.reply({ content: `Latest blacklist entries:\n${lines.join('\n')}`, ephemeral: true, allowedMentions: { parse: [] } });
          return;
        }
      }

      // end of slash handlers
    }

    // Buttons
    if (interaction.isButton()) {
      const id = interaction.customId;

      // buttons for apply-panel open modals
      if (id === 'apply_family' || id === 'apply_restore' || id === 'apply_unblack') {
        const type = id.split('_')[1]; // family / restore / unblack
        const modal = new ModalBuilder()
          .setCustomId(`apply_modal_${type}`)
          .setTitle(type === 'family' ? 'Заявка — вступление' : type === 'restore' ? 'Заявка — восстановление' : 'Заявка — снятие ЧС');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('your_name').setLabel('Ваше имя (OOC)').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('discord').setLabel('Discord (nick#0000)').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('ic').setLabel('IC - Имя, Фамилия, #статик').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('history').setLabel('В каких семьях состояли?').setStyle(TextInputStyle.Paragraph).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('motivation').setLabel('Почему выбираете нас?').setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      // accept button inside thread (expects to be pressed in a thread)
      if (id.startsWith('accept_')) {
        const thread = interaction.channel;
        if (!thread.isThread()) {
          await interaction.reply({ content: 'This button works inside threads only.', ephemeral: true });
          return;
        }
        const emb = new EmbedBuilder().setTitle('✅ Заявка одобрена').setDescription(`Лидер: <@${interaction.user.id}>`).setColor(0x2ecc71).setTimestamp();
        await thread.send({ embeds: [emb] }).catch(() => {});
        await thread.setArchived(true).catch(() => {});
        if (LEADERS_LOG_CHANNEL_ID) {
          const log = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(() => null);
          if (log && log.isTextBased()) {
            await log.send({ embeds: [new EmbedBuilder().setTitle('📗 Одобрение заявки').addFields({ name: 'Лидер', value: `<@${interaction.user.id}>` }, { name: 'Тред', value: thread.name }).setColor(0x2ecc71)] }).catch(() => {});
          }
        }
        await interaction.reply({ content: 'Application accepted.', ephemeral: true });
        return;
      }

      // deny button opens modal for reason
      if (id.startsWith('deny_')) {
        const modal = new ModalBuilder().setCustomId('deny_reason_modal').setTitle('Причина отклонения')
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('Причина').setStyle(TextInputStyle.Paragraph).setRequired(true)
          ));
        await interaction.showModal(modal);
        return;
      }
    }

    // Modal submits
    if (interaction.isModalSubmit()) {
      // deny reason modal
      if (interaction.customId === 'deny_reason_modal') {
        const reason = interaction.fields.getTextInputValue('reason');
        const thread = interaction.channel;
        const emb = new EmbedBuilder().setTitle('❌ Заявка отклонена').setDescription(`Причина: **${reason}**\nЛидер: <@${interaction.user.id}>`).setColor(0xe74c3c).setTimestamp();
        await thread.send({ embeds: [emb] }).catch(() => {});
        await thread.setArchived(true).catch(() => {});
        if (LEADERS_LOG_CHANNEL_ID) {
          const log = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(() => null);
          if (log && log.isTextBased()) {
            await log.send({ embeds: [new EmbedBuilder().setTitle('📕 Отклонение заявки').addFields({ name: 'Лидер', value: `<@${interaction.user.id}>` }, { name: 'Причина', value: reason }).setColor(0xe74c3c)] }).catch(() => {});
          }
        }
        await interaction.reply({ content: 'Application rejected.', ephemeral: true });
        return;
      }

      // application modal submit (family / restore / unblack)
      if (interaction.customId.startsWith('apply_modal_')) {
        const type = interaction.customId.replace('apply_modal_', '');
        const yourName = interaction.fields.getTextInputValue('your_name');
        const discord = interaction.fields.getTextInputValue('discord');
        const ic = interaction.fields.getTextInputValue('ic');
        const history = interaction.fields.getTextInputValue('history');
        const motivation = interaction.fields.getTextInputValue('motivation');

        // basic validation
        const errors = [];
        if (!yourName || yourName.length < 2) errors.push('Имя слишком короткое.');
        if (!discord || (!discord.includes('#') && !discord.includes('@'))) errors.push('Discord указан неверно.');
        if (!ic || ic.length < 3) errors.push('IC слишком короткое.');
        if (!history || history.length < 6) errors.push('История слишком короткая.');
        if (!motivation || motivation.length < 6) errors.push('Мотивация слишком короткая.');

        if (errors.length) {
          await interaction.reply({ content: '❌ Ошибки:\n' + errors.map(e => `• ${e}`).join('\n'), ephemeral: true });
          return;
        }

        const emb = new EmbedBuilder()
          .setTitle(type === 'family' ? '📩 Заявка на вступление' : type === 'restore' ? '📩 Заявка — восстановление' : '📩 Заявка — снятие ЧС')
          .setColor(0x7b68ee)
          .addFields(
            { name: 'Имя (OOC)', value: yourName },
            { name: 'Discord', value: discord },
            { name: 'IC данные', value: ic },
            { name: 'История', value: history },
            { name: 'Мотивация', value: motivation }
          )
          .setFooter({ text: 'Заявка' })
          .setTimestamp();

        if (!APP_CHANNEL_ID) {
          await interaction.reply({ content: 'APP_CHANNEL_ID not set.', ephemeral: true });
          return;
        }
        const forum = await client.channels.fetch(APP_CHANNEL_ID).catch(() => null);
        if (!forum) {
          await interaction.reply({ content: 'Cannot find applications channel.', ephemeral: true });
          return;
        }

        // try forum thread creation (forum channels support threads.create({...}))
        try {
          if (forum.threads && typeof forum.threads.create === 'function') {
            const thread = await forum.threads.create({
              name: `Заявка — ${yourName}`,
              message: {
                content: ALLOWED_ROLE_IDS.map(r => `<@&${r}>`).join(' '),
                embeds: [emb],
                components: [
                  new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`accept_${interaction.user.id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`deny_${interaction.user.id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
                  )
                ]
              }
            });
            // optional: send short confirmation in thread
            await interaction.reply({ content: 'Заявка отправлена!', ephemeral: true });
            return;
          } else {
            // fallback: send message and start thread if allowed
            const sent = await forum.send({ content: ALLOWED_ROLE_IDS.map(r => `<@&${r}>`).join(' '), embeds: [emb] }).catch(() => null);
            if (sent && sent.startThread) {
              try { await sent.startThread({ name: `Заявка — ${yourName}` }); } catch {}
            }
            await interaction.reply({ content: 'Заявка отправлена (fallback).', ephemeral: true });
            return;
          }
        } catch (err) {
          console.error('Failed to post application:', err);
          await interaction.reply({ content: 'Error posting application. Check bot permissions and channel type.', ephemeral: true });
          return;
        }
      }
    }
  } catch (err) {
    console.error('Interaction handler error:', err);
    try { if (interaction && !interaction.replied) await interaction.reply({ content: 'Произошла ошибка.', ephemeral: true }); } catch {}
  }
});

// ---------------------- START ----------------------
client.login(DISCORD_TOKEN).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});

// Minimal express health endpoint (optional)
const app = express();
app.get('/', (_req, res) => res.send('Versize bot running'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`HTTP server listening on ${port}`));
