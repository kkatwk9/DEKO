// index.js — Versize all-in-one
import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import cookieParser from 'cookie-parser';
import session from 'express-session';

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
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';

import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

// -------------------------------
//  ENV / config
// -------------------------------
const {
  DISCORD_TOKEN,
  CLIENT_ID,
  CLIENT_SECRET,
  GUILD_ID,
  APP_CHANNEL_ID,
  AUDIT_CHANNEL_ID,
  LEADERS_LOG_CHANNEL_ID,
  BLACKLIST_CHANNEL_ID,
  ALLOWED_ROLES,
  OAUTH_REDIRECT_URI,
  SESSION_SECRET,
  PORT
} = process.env;

function envCheck(name, val) {
  if (!val) console.warn(`⚠️ ENV ${name} is not set`);
}
['DISCORD_TOKEN','CLIENT_ID','GUILD_ID'].forEach(n => envCheck(n, process.env[n]));

const ALLOWED_ROLE_IDS = (ALLOWED_ROLES || '').split(',').map(s => s.trim()).filter(Boolean);

// -------------------------------
//  Discord client
// -------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// -------------------------------
//  Define commands (slash)
// -------------------------------
const commands = [
  new SlashCommandBuilder().setName('apply-panel').setDescription('Опубликовать панель заявок'),
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Создать эмбэд')
    .addStringOption(o => o.setName('title').setDescription('Заголовок').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Текст').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Цвет #hex')),
  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Записать в аудит')
    .addUserOption(o => o.setName('author').setDescription('Кто').setRequired(true))
    .addUserOption(o => o.setName('target').setDescription('Кого').setRequired(true))
    .addStringOption(o => o.setName('action').setDescription('Действие').setRequired(true)
      .addChoices(
        { name: 'Повышение', value: 'promote' },
        { name: 'Понижение', value: 'demote' },
        { name: 'Выговор', value: 'warn' },
        { name: 'Увольнение', value: 'fire' },
        { name: 'Выдача ранга', value: 'give_rank' }
      ))
    .addStringOption(o => o.setName('from_rank').setDescription('С какого ранга')
      .addChoices(
        { name: '8 — Generalisimus', value: '8' },
        { name: '7 — Vice Gen.', value: '7' },
        { name: '6 — Gen. Secretary', value: '6' },
        { name: '5 — Curator', value: '5' },
        { name: '4 — Curator\'s Office', value: '4' },
        { name: '3 — Stacked', value: '3' },
        { name: '2 — Main', value: '2' },
        { name: '1 — NewBie', value: '1' }
      ))
    .addStringOption(o => o.setName('to_rank').setDescription('На какой ранг')
      .addChoices(
        { name: '8 — Generalisimus', value: '8' },
        { name: '7 — Vice Gen.', value: '7' },
        { name: '6 — Gen. Secretary', value: '6' },
        { name: '5 — Curator', value: '5' },
        { name: '4 — Curator\'s Office', value: '4' },
        { name: '3 — Stacked', value: '3' },
        { name: '2 — Main', value: '2' },
        { name: '1 — NewBie', value: '1' }
      ))
    .addStringOption(o => o.setName('reason').setDescription('Причина')),
  new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Добавить в черный список семьи')
    .addStringOption(o => o.setName('static').setDescription('Статик участника / идентификатор').setRequired(true))
    .addUserOption(o => o.setName('member').setDescription('Участник (если нужно)'))
    .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Срок (например: 30d, permanent)').setRequired(false))
].map(c => c.toJSON());

// -------------------------------
//  Register commands on startup
// -------------------------------
async function registerCommands() {
  if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error('Missing DISCORD_TOKEN / CLIENT_ID / GUILD_ID — cannot register commands');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    console.log('Registering slash commands to guild', GUILD_ID, 'app', CLIENT_ID);
    const res = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Commands registered:', Array.isArray(res) ? res.length : 'unknown');
  } catch (err) {
    console.error('Slash registration error:', err?.message || err);
    if (err?.rawError) console.error('rawError:', err.rawError);
  }
}

// -------------------------------
//  Interaction handling
// -------------------------------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      // apply-panel
      if (name === 'apply-panel') {
        // optional check: allow only leaders
        const has = ALLOWED_ROLE_IDS.length === 0 || interaction.member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id));
        if (!has && !interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({ content: 'У вас нет прав на публикацию панели.', ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('✉️ Панель заявок Versize')
          .setDescription('Выберите тип заявки ниже.')
          .setColor(0x7b68ee);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('apply_family').setLabel('Подать в семью').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('apply_restore').setLabel('Восстановление').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('apply_unblack').setLabel('Снятие ЧС').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }

      // embed
      if (name === 'embed') {
        const title = interaction.options.getString('title', true);
        const description = interaction.options.getString('description', true);
        const color = interaction.options.getString('color') || '#7b68ee';
        const e = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
        await interaction.reply({ embeds: [e] });
        return;
      }

      // audit
      if (name === 'audit') {
        const actor = interaction.options.getUser('author', true);
        const target = interaction.options.getUser('target', true);
        const action = interaction.options.getString('action', true);
        const fromRank = interaction.options.getString('from_rank') || '—';
        const toRank = interaction.options.getString('to_rank') || '—';
        const reason = interaction.options.getString('reason') || '—';

        const ACTION_MAP = { promote: 'Повышение', demote: 'Понижение', warn: 'Выговор', fire: 'Увольнение', give_rank: 'Выдача ранга' };

        const emb = new EmbedBuilder()
          .setTitle('📝 Аудит')
          .setColor(0xf1c40f)
          .addFields(
            { name: 'Действие', value: ACTION_MAP[action] || action, inline: true },
            { name: 'Кто', value: `<@${actor.id}>`, inline: true },
            { name: 'Кого', value: `<@${target.id}>`, inline: true },
            { name: 'С ранга', value: fromRank, inline: true },
            { name: 'На ранг', value: toRank, inline: true },
            { name: 'Причина', value: reason, inline: false }
          )
          .setTimestamp();

        if (!AUDIT_CHANNEL_ID) {
          await interaction.reply({ content: 'AUDIT_CHANNEL_ID не настроен в .env', ephemeral: true });
          return;
        }
        const ch = await client.channels.fetch(AUDIT_CHANNEL_ID).catch(() => null);
        if (!ch || !ch.isTextBased()) {
          await interaction.reply({ content: 'Не могу отправить в канал аудита (проверь ID / права).', ephemeral: true });
          return;
        }
        await ch.send({ embeds: [emb] }).catch(()=>{});
        await interaction.reply({ content: 'Аудит отправлен.', ephemeral: true });
        return;
      }

      // blacklist
      if (name === 'blacklist') {
        // check allowed roles
        const allowed = ALLOWED_ROLE_IDS.length === 0 || interaction.member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id));
        if (!allowed && !interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({ content: 'У вас нет прав выполнять эту команду.', ephemeral: true });
          return;
        }

        const staticName = interaction.options.getString('static', true);
        const member = interaction.options.getUser('member');
        const reason = interaction.options.getString('reason', true);
        const duration = interaction.options.getString('duration') || '—';

        const emb = new EmbedBuilder()
          .setTitle('⛔️ Новая запись в Blacklist')
          .setColor(0xe74c3c)
          .addFields(
            { name: 'Статик', value: staticName, inline: true },
            { name: 'Участник', value: member ? `<@${member.id}>` : '—', inline: true },
            { name: 'Причина', value: reason, inline: false },
            { name: 'Срок', value: duration, inline: true },
            { name: 'Добавил', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setTimestamp();

        if (!BLACKLIST_CHANNEL_ID) {
          await interaction.reply({ content: 'BLACKLIST_CHANNEL_ID не задан в .env', ephemeral: true });
          return;
        }
        const ch = await client.channels.fetch(BLACKLIST_CHANNEL_ID).catch(() => null);
        if (!ch || !ch.isTextBased()) {
          await interaction.reply({ content: 'Не могу найти канал для черного списка или нет прав.', ephemeral: true });
          return;
        }

        // send and also post a short pinned summary (optionally)
        await ch.send({ embeds: [emb] }).catch(()=>{});
        // Optionally: maintain a persistent message list — skipped for simplicity

        // also log to leaders log
        if (LEADERS_LOG_CHANNEL_ID) {
          const logch = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(()=>null);
          if (logch && logch.isTextBased()) {
            await logch.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle('📋 Blacklist — добавлен')
                  .addFields(
                    { name: 'Статик', value: staticName },
                    { name: 'Кто', value: `<@${interaction.user.id}>` },
                    { name: 'Причина', value: reason },
                    { name: 'Срок', value: duration }
                  )
                  .setColor(0xff9900)
                  .setTimestamp()
              ]
            }).catch(()=>{});
          }
        }

        await interaction.reply({ content: 'Добавлено в черный список.', ephemeral: true });
        return;
      }
    }

    // BUTTONS (apply panel)
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('apply_')) {
        const type = interaction.customId.replace('apply_', '');
        const modal = new ModalBuilder()
          .setCustomId(`apply_modal_${type}`)
          .setTitle(type === 'family' ? 'Заявка — вступление' : type === 'restore' ? 'Заявка — восстановление' : 'Заявка — снятие ЧС');

        // Discord allows up to 5 text inputs in a modal
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('your_name').setLabel('Ваше имя (OOC)').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('discord').setLabel('Ваш Discord').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('ic_name').setLabel('IC имя / статик').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('history').setLabel('Где были раньше?').setStyle(TextInputStyle.Paragraph).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('motivation').setLabel('Почему именно мы?').setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      // accept/deny inside thread
      if (interaction.customId.startsWith('accept_')) {
        const thread = interaction.channel;
        if (!thread?.isThread()) return interaction.reply({ content: 'Кнопка работает в треде.', ephemeral: true });

        await thread.send({ embeds: [new EmbedBuilder().setTitle('✅ Заявка одобрена').setDescription(`Лидер: <@${interaction.user.id}>`).setColor(0x2ecc71).setTimestamp()] }).catch(()=>{});
        await thread.setArchived(true).catch(()=>{});
        if (LEADERS_LOG_CHANNEL_ID) {
          const lch = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(()=>null);
          if (lch && lch.isTextBased()) await lch.send({ embeds: [new EmbedBuilder().setTitle('📗 Одобрено').addFields({ name: 'Лидер', value: `<@${interaction.user.id}>` }, { name: 'Тред', value: thread.name }).setColor(0x2ecc71)] }).catch(()=>{});
        }
        await interaction.reply({ content: 'Одобрено.', ephemeral: true });
        return;
      }
      if (interaction.customId.startsWith('deny_')) {
        const modal = new ModalBuilder().setCustomId('deny_reason_modal').setTitle('Причина отклонения').addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Причина').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        await interaction.showModal(modal);
        return;
      }
    }

    // MODAL SUBMIT
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'deny_reason_modal') {
        const reason = interaction.fields.getTextInputValue('reason');
        const thread = interaction.channel;
        await thread.send({ embeds: [new EmbedBuilder().setTitle('❌ Отклонено').setDescription(`Причина: ${reason}\nЛидер: <@${interaction.user.id}>`).setColor(0xe74c3c).setTimestamp()] }).catch(()=>{});
        await thread.setArchived(true).catch(()=>{});
        if (LEADERS_LOG_CHANNEL_ID) {
          const logch = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(()=>null);
          if (logch && logch.isTextBased()) await logch.send({ embeds: [new EmbedBuilder().setTitle('📕 Отклонение').addFields({ name: 'Лидер', value: `<@${interaction.user.id}>` }, { name: 'Причина', value: reason }).setColor(0xe74c3c)] }).catch(()=>{});
        }
        await interaction.reply({ content: 'Отклонено.', ephemeral: true });
        return;
      }

      if (interaction.customId.startsWith('apply_modal_')) {
        const type = interaction.customId.replace('apply_modal_', '');
        const yourName = interaction.fields.getTextInputValue('your_name');
        const discord = interaction.fields.getTextInputValue('discord');
        const ic = interaction.fields.getTextInputValue('ic_name');
        const history = interaction.fields.getTextInputValue('history');
        const motivation = interaction.fields.getTextInputValue('motivation');

        // basic validation
        const errors = [];
        if (yourName.length < 2) errors.push('Имя слишком короткое.');
        if (!discord || discord.length < 3) errors.push('Discord указан неверно.');
        if (ic.length < 3) errors.push('IC слишком короткое.');
        if (history.length < 6) errors.push('История слишком короткая.');
        if (motivation.length < 6) errors.push('Мотивация слишком короткая.');

        if (errors.length) {
          await interaction.reply({ content: '❌ Ошибки:\n' + errors.map(e => `• ${e}`).join('\n'), ephemeral: true });
          return;
        }

        const emb = new EmbedBuilder()
          .setTitle(type === 'family' ? '📩 Заявка — вступление' : type === 'restore' ? '📩 Заявка — восстановление' : '📩 Снятие ЧС')
          .setColor(0x7b68ee)
          .addFields(
            { name: 'Имя (OOC)', value: yourName },
            { name: 'Discord', value: discord },
            { name: 'IC', value: ic },
            { name: 'История', value: history },
            { name: 'Мотивация', value: motivation }
          );

        // Forum channel: create thread message
        if (!APP_CHANNEL_ID) {
          await interaction.reply({ content: 'APP_CHANNEL_ID не задан в .env', ephemeral: true });
          return;
        }
        const forum = await client.channels.fetch(APP_CHANNEL_ID).catch(()=>null);
        if (!forum) {
          await interaction.reply({ content: 'Канал заявок не найден (проверь ID).', ephemeral: true });
          return;
        }

        // create forum post / thread
        try {
          const thread = await forum.threads.create({
            name: `Заявка — ${yourName}`,
            message: {
              content: ALLOWED_ROLE_IDS.map(r => `<@&${r}>`).join(' '),
              embeds: [emb],
              components: [ new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`accept_${interaction.user.id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`deny_${interaction.user.id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
              )]
            }
          });
          await interaction.reply({ content: 'Заявка отправлена в форум.', ephemeral: true });
        } catch (e) {
          console.error('Create thread error:', e);
          await interaction.reply({ content: 'Не удалось создать в форуме (проверь права/канал).', ephemeral: true });
        }
        return;
      }
    }

  } catch (err) {
    console.error('Interaction error:', err);
    try {
      if (interaction && !interaction.replied) await interaction.reply({ content: 'Произошла ошибка, администратор уведомлён.', ephemeral: true });
    } catch {}
  }
});

// -------------------------------
//  Web panel (express) — minimal
// -------------------------------
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET || 'versize_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000*60*60*12 }
}));

// OAuth URL (for login button) — make sure OAUTH_REDIRECT_URI set
const DISCORD_OAUTH_URL = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI || 'http://localhost:8080/oauth/callback')}&response_type=code&scope=identify%20guilds%20guilds.members.read`;

// requireAuth middleware simplified (uses tokens store)
global.oauthTokens = {};

async function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  // option: verify membership
  next();
}

app.get('/login', (req, res) => {
  res.send(`<html><body style="font-family:Arial;background:#0d0b16;color:#fff;padding:50px"><h1>Versize Panel</h1><a href="${DISCORD_OAUTH_URL}" style="background:#7b68ee;padding:12px 20px;border-radius:8px;color:#fff;text-decoration:none">Войти через Discord</a></body></html>`);
});

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code');
  try {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', OAUTH_REDIRECT_URI);

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', body: params, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }});
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.send('Auth failed');

    const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` }});
    const userData = await userRes.json();
    global.oauthTokens[userData.id] = tokenData.access_token;
    req.session.user = { id: userData.id, username: userData.username, avatar: userData.avatar };
    res.redirect('/panel');
  } catch (e) {
    console.error('OAuth callback error', e);
    res.send('OAuth error');
  }
});

app.get('/panel', requireAuth, (req, res) => {
  res.send(`<html><body style="font-family:Arial;background:#0d0b16;color:#fff;padding:20px"><h1>Panel</h1><p>Welcome ${req.session.user.username}</p><p><a href="/panel/applications" style="color:#7b68ee">Applications</a></p><p><a href="/logout">Logout</a></p></body></html>`);
});

app.get('/panel/applications', requireAuth, async (req, res) => {
  if (!APP_CHANNEL_ID) return res.send('APP_CHANNEL_ID not set');
  const forum = await client.channels.fetch(APP_CHANNEL_ID).catch(()=>null);
  if (!forum) return res.send('Forum channel not found');
  const threads = await forum.threads.fetchActive().catch(()=>null);
  let rows = '';
  if (threads && threads.threads) {
    for (const [id, t] of threads.threads) {
      rows += `<tr><td>${t.name}</td><td>${t.ownerId ? `<@${t.ownerId}>` : '-'}</td><td>${new Date(t.createdAt).toLocaleString()}</td><td><a href="/api/thread/accept?id=${t.id}">Accept</a> | <a href="/api/thread/deny?id=${t.id}">Deny</a></td></tr>`;
    }
  }
  res.send(`<html><body style="font-family:Arial;background:#0d0b16;color:#fff;padding:20px"><h1>Applications</h1><table border="0" cellpadding="8" style="color:#fff"><tr><th>Name</th><th>Owner</th><th>Created</th><th>Actions</th></tr>${rows}</table><p><a href="/panel">Back</a></p></body></html>`);
});

app.get('/api/thread/accept', requireAuth, async (req, res) => {
  const id = req.query.id;
  if (!id) return res.send('id missing');
  try {
    const thread = await client.channels.fetch(id);
    if (!thread.isThread()) return res.send('not thread');
    await thread.send({ embeds: [ new EmbedBuilder().setTitle('✅ Одобрено (panel)').setDescription(`Лидер: ${req.session.user.username}`).setColor(0x2ecc71) ] }).catch(()=>{});
    await thread.setArchived(true).catch(()=>{});
    if (LEADERS_LOG_CHANNEL_ID) {
      const lch = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(()=>null);
      if (lch && lch.isTextBased()) await lch.send({ embeds: [ new EmbedBuilder().setTitle('📗 Одобрено (WEB)').addFields({ name: 'Leader', value: req.session.user.username}, { name: 'Thread', value: thread.name}).setColor(0x2ecc71) ] }).catch(()=>{});
    }
    res.redirect('/panel/applications');
  } catch (e) {
    console.error('accept api error', e);
    res.send('error');
  }
});

app.get('/api/thread/deny', requireAuth, async (req, res) => {
  const id = req.query.id;
  if (!id) return res.send('id missing');
  if (!req.query.reason) {
    return res.send(`<form><input type="hidden" name="id" value="${id}"><textarea name="reason" style="width:400px;height:120px"></textarea><br><button>Send</button></form>`);
  }
  const reason = req.query.reason;
  try {
    const thread = await client.channels.fetch(id);
    await thread.send({ embeds: [ new EmbedBuilder().setTitle('❌ Отклонено (panel)').addFields({ name: 'Leader', value: req.session.user.username }, { name: 'Reason', value: reason}).setColor(0xe74c3c) ] }).catch(()=>{});
    await thread.setArchived(true).catch(()=>{});
    if (LEADERS_LOG_CHANNEL_ID) {
      const lch = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(()=>null);
      if (lch && lch.isTextBased()) await lch.send({ embeds: [ new EmbedBuilder().setTitle('📕 Отклонено (WEB)').addFields({ name: 'Leader', value: req.session.user.username }, { name: 'Reason', value: reason }).setColor(0xe74c3c) ] }).catch(()=>{});
    }
    res.redirect('/panel/applications');
  } catch (e) {
    console.error('deny api error', e);
    res.send('error');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(()=>res.redirect('/login'));
});

// -------------------------------
//  Startup
// -------------------------------
const serverPort = PORT || 8080;
app.listen(serverPort, () => {
  console.log(`🌐 Versize Web Panel запущена на порту: ${serverPort}`);
  if (process.env.RAILWAY_ENVIRONMENT) console.log('Running on Railway');
});

// Register commands then login
registerCommands().then(()=> {
  client.login(DISCORD_TOKEN).catch(err => console.error('Discord login error', err));
});

client.once(Events.ClientReady, () => {
  console.log('Logged in as', client.user.tag);
});
