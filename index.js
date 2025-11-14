// index.js
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import fetch from 'node-fetch';

import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} from 'discord.js';

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  CLIENT_SECRET,
  GUILD_ID,
  APP_CHANNEL_ID,
  AUDIT_CHANNEL_ID,
  LEADERS_LOG_CHANNEL_ID,
  ALLOWED_ROLES,
  OAUTH_REDIRECT_URI,
  SESSION_SECRET,
  BLACKLIST_CHANNEL_ID,
  PORT
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('DISCORD_TOKEN and CLIENT_ID must be set in .env');
  process.exit(1);
}

const ALLOWED_ROLE_IDS = (ALLOWED_ROLES || "").split(',').map(s => s.trim()).filter(Boolean);

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Ready
client.once(Events.ClientReady, () => {
  console.log('Logged in as', client.user.tag);
});

// INTERACTIONS
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      // apply-panel
      if (interaction.commandName === 'apply-panel') {
        // optional: permission check
        const embed = new EmbedBuilder()
          .setTitle('✉️ Панель заявок Versize')
          .setDescription('Выберите тип заявки ниже.')
          .setColor(0x7b68ee);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('apply_family').setLabel('Подать заявку в семью').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('apply_restore').setLabel('Восстановление').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('apply_unblack').setLabel('Снятие ЧС').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }

      // embed
      if (interaction.commandName === 'embed') {
        const title = interaction.options.getString('title', true);
        const desc = interaction.options.getString('description', true);
        const color = interaction.options.getString('color') || '#7b68ee';
        const e = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color);
        await interaction.reply({ embeds: [e] });
        return;
      }

      // audit
      if (interaction.commandName === 'audit') {
        const actor = interaction.options.getUser('author', true);
        const target = interaction.options.getUser('target', true);
        const action = interaction.options.getString('action', true);
        const fromRank = interaction.options.getString('from_rank') || '—';
        const toRank = interaction.options.getString('to_rank') || '—';
        const reason = interaction.options.getString('reason') || '—';

        const ACTION_MAP = {
          promote: 'Повышение',
          demote: 'Понижение',
          warn: 'Выговор',
          fire: 'Увольнение',
          give_rank: 'Выдача ранга'
        };

        const embed = new EmbedBuilder()
          .setTitle('📝 Аудит — запись действия')
          .setColor(0xf1c40f)
          .addFields(
            { name: 'Действие', value: ACTION_MAP[action] || action, inline: true },
            { name: 'Кто', value: `<@${actor.id}>`, inline: true },
            { name: 'Кого', value: `<@${target.id}>`, inline: true },
            { name: 'Из ранга', value: `${fromRank}`, inline: true },
            { name: 'В ранг', value: `${toRank}`, inline: true },
            { name: 'Причина', value: reason, inline: false }
          )
          .setTimestamp();

        if (!AUDIT_CHANNEL_ID) {
          await interaction.reply({ content: 'AUDIT_CHANNEL_ID не задан в .env', ephemeral: true });
          return;
        }
        const ch = await client.channels.fetch(AUDIT_CHANNEL_ID).catch(() => null);
        if (!ch || !ch.isTextBased()) {
          await interaction.reply({ content: 'Канал аудита не найден или нет доступа.', ephemeral: true });
          return;
        }
        await ch.send({ embeds: [embed] }).catch(() => {});
        await interaction.reply({ content: 'Аудит записан.', ephemeral: true });
        return;
      }

      // blacklist
      if (interaction.commandName === 'blacklist') {
        // permission check: ManageGuild or role in ALLOWED_ROLE_IDS
        let allowed = false;
        try {
          if (interaction.memberPermissions?.has?.('ManageGuild')) allowed = true;
          if (!allowed && ALLOWED_ROLE_IDS.length) {
            const rolesCache = interaction.member?.roles?.cache;
            if (rolesCache) {
              const memberRoles = rolesCache.map(r => r.id || r);
              allowed = memberRoles.some(r => ALLOWED_ROLE_IDS.includes(r));
            }
          }
        } catch (e) { /* ignore */ }

        if (!allowed) {
          await interaction.reply({ content: 'У вас нет прав для работы с ЧС.', ephemeral: true });
          return;
        }

        const sub = interaction.options.getSubcommand();
        if (!BLACKLIST_CHANNEL_ID) {
          await interaction.reply({ content: 'BLACKLIST_CHANNEL_ID не задан в .env', ephemeral: true });
          return;
        }
        const ch = await client.channels.fetch(BLACKLIST_CHANNEL_ID).catch(() => null);
        if (!ch || !ch.isTextBased()) {
          await interaction.reply({ content: 'Канал ЧС не найден или нет доступа.', ephemeral: true });
          return;
        }

        if (sub === 'add') {
          const staticText = interaction.options.getString('static', true);
          const user = interaction.options.getUser('member');
          const reason = interaction.options.getString('reason', true);
          const duration = interaction.options.getString('duration') || '—';

          const embed = new EmbedBuilder()
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

          const sent = await ch.send({ embeds: [embed] }).catch(err => { console.error('BL send err', err); return null; });
          if (!sent) {
            await interaction.reply({ content: 'Не удалось добавить запись в канал ЧС.', ephemeral: true });
            return;
          }

          await interaction.reply({ content: `Запись добавлена в ЧС: ${staticText}\n${sent.url}`, ephemeral: true });
          return;
        }

        if (sub === 'remove') {
          const staticText = interaction.options.getString('static');
          const messageId = interaction.options.getString('message_id');

          if (messageId) {
            try {
              const msg = await ch.messages.fetch(messageId);
              await msg.delete();
              await interaction.reply({ content: `Запись (id: ${messageId}) удалена.`, ephemeral: true });
              return;
            } catch (e) {
              await interaction.reply({ content: `Не удалось найти/удалить сообщение с id ${messageId}.`, ephemeral: true });
              return;
            }
          }

          if (staticText) {
            const fetched = await ch.messages.fetch({ limit: 100 }).catch(() => null);
            if (!fetched) {
              await interaction.reply({ content: 'Не удалось получить сообщения из канала ЧС.', ephemeral: true });
              return;
            }
            const found = fetched.find(m => {
              const e = m.embeds[0];
              if (!e) return false;
              const f = e.fields?.find(ff => ff.name === 'Статик');
              return f && f.value && f.value.toLowerCase().includes(staticText.toLowerCase());
            });

            if (!found) {
              await interaction.reply({ content: 'Запись с таким статиком не найдена.', ephemeral: true });
              return;
            }

            await found.delete().catch(() => {});
            await interaction.reply({ content: `Запись с статиком "${staticText}" удалена.`, ephemeral: true });
            return;
          }

          await interaction.reply({ content: 'Укажите либо message_id, либо static для удаления.', ephemeral: true });
          return;
        }

        if (sub === 'list') {
          const limit = Math.min(interaction.options.getInteger('limit') || 10, 25);
          const fetched = await ch.messages.fetch({ limit }).catch(() => null);
          if (!fetched) {
            await interaction.reply({ content: 'Не удалось получить сообщения из канала ЧС.', ephemeral: true });
            return;
          }

          const lines = fetched.map(m => {
            const e = m.embeds[0];
            if (!e) return `${m.id} — (пустой эмбед)`;
            const s = e.fields?.find(f => f.name === 'Статик')?.value || '—';
            const r = e.fields?.find(f => f.name === 'Причина')?.value || '—';
            const d = e.fields?.find(f => f.name === 'Срок')?.value || '—';
            return `• ${s} | ${r} | ${d} — ${m.url}`;
          }).slice(0, limit);

          if (!lines.length) {
            await interaction.reply({ content: 'ЧС пуст.', ephemeral: true });
            return;
          }

          await interaction.reply({ content: `Последние записи ЧС:\n${lines.join('\n')}`, ephemeral: true, allowedMentions: { parse: [] } });
          return;
        }
      }
    }

    // Buttons (apply-panel buttons and accept/deny)
    if (interaction.isButton()) {
      // apply buttons open modal
      if (interaction.customId.startsWith('apply_')) {
        const type = interaction.customId.replace('apply_', '');
        const modal = new ModalBuilder()
          .setCustomId(`apply_modal_${type}`)
          .setTitle(type === 'family' ? 'Заявка — Вступление' : type === 'restore' ? 'Заявка — Восстановление' : 'Заявка — Снятие ЧС');

        // Discord modal supports up to 5 inputs, do concise fields
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('your_name').setLabel('Ваше имя (OOC)').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('discord').setLabel('Ваш Discord (nick#0000)').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('ic_name').setLabel('IC - Имя, Фамилия, #статик').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('history').setLabel('В каких семьях состояли? (кратко)').setStyle(TextInputStyle.Paragraph).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('motivation').setLabel('Почему выбрали нас?').setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      // accept button inside thread
      if (interaction.customId.startsWith('accept_')) {
        const thread = interaction.channel;
        if (!thread.isThread()) {
          await interaction.reply({ content: 'Кнопка работает только в треде.', ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ Заявка одобрена')
          .setDescription(`Лидер: <@${interaction.user.id}>`)
          .setColor(0x2ecc71)
          .setTimestamp();

        await thread.send({ embeds: [embed] }).catch(() => {});
        await thread.setArchived(true).catch(() => {});
        if (LEADERS_LOG_CHANNEL_ID) {
          const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(() => null);
          if (logCh && logCh.isTextBased()) {
            await logCh.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle('📗 Одобрение заявки')
                  .addFields({ name: 'Лидер', value: `<@${interaction.user.id}>` }, { name: 'Тред', value: thread.name })
                  .setColor(0x2ecc71)
              ]
            }).catch(() => {});
          }
        }

        await interaction.reply({ content: 'Одобрено.', ephemeral: true });
        return;
      }

      // deny button shows modal
      if (interaction.customId.startsWith('deny_')) {
        const modal = new ModalBuilder()
          .setCustomId('deny_reason_modal')
          .setTitle('Причина отклонения')
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('Причина отказа').setStyle(TextInputStyle.Paragraph).setRequired(true)
          ));
        await interaction.showModal(modal);
        return;
      }
    }

    // Modal submit handling
    if (interaction.isModalSubmit()) {
      // deny modal
      if (interaction.customId === 'deny_reason_modal') {
        const reason = interaction.fields.getTextInputValue('reason');
        const thread = interaction.channel;
        const embed = new EmbedBuilder()
          .setTitle('❌ Заявка отклонена')
          .setDescription(`Причина: **${reason}**\nЛидер: <@${interaction.user.id}>`)
          .setColor(0xe74c3c)
          .setTimestamp();

        await thread.send({ embeds: [embed] }).catch(() => {});
        await thread.setArchived(true).catch(() => {});

        if (LEADERS_LOG_CHANNEL_ID) {
          const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(() => null);
          if (logCh && logCh.isTextBased()) {
            await logCh.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle('📕 Отклонение заявки')
                  .addFields({ name: 'Лидер', value: `<@${interaction.user.id}>` }, { name: 'Причина', value: reason })
                  .setColor(0xe74c3c)
              ]
            }).catch(() => {});
          }
        }

        await interaction.reply({ content: 'Заявка отклонена.', ephemeral: true });
        return;
      }

      // apply modal
      if (interaction.customId.startsWith('apply_modal_')) {
        const type = interaction.customId.replace('apply_modal_', '');
        const yourName = interaction.fields.getTextInputValue('your_name');
        const discord = interaction.fields.getTextInputValue('discord');
        const ic = interaction.fields.getTextInputValue('ic_name');
        const history = interaction.fields.getTextInputValue('history');
        const motivation = interaction.fields.getTextInputValue('motivation');

        // simple validations
        const errors = [];
        if (yourName.length < 2) errors.push('Имя слишком короткое.');
        if (!discord || (!discord.includes('#') && !discord.includes('@'))) errors.push('Discord указан неверно.');
        if (ic.length < 3) errors.push('IC слишком короткое.');
        if (history.length < 6) errors.push('История слишком короткая.');
        if (motivation.length < 6) errors.push('Мотивация слишком короткая.');

        if (errors.length) {
          await interaction.reply({ content: '❌ Ошибки:\n' + errors.map(e => `• ${e}`).join('\n'), ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(type === 'family' ? '📩 Заявка на вступление' : type === 'restore' ? '📩 Заявка на восстановление' : '📩 Заявка на снятие ЧС')
          .setColor(0x7b68ee)
          .addFields(
            { name: 'Имя (OOC)', value: yourName },
            { name: 'Discord', value: discord },
            { name: 'IC данные', value: ic },
            { name: 'История', value: history },
            { name: 'Мотивация', value: motivation }
          );

        if (!APP_CHANNEL_ID) {
          await interaction.reply({ content: 'APP_CHANNEL_ID не задан в .env', ephemeral: true });
          return;
        }

        const forum = await client.channels.fetch(APP_CHANNEL_ID).catch(() => null);
        if (!forum || forum.type !== 15 /* GUILD_FORUM */) {
          // still try to create a normal thread if forum isn't configured
          // in many servers forum type is 15; but if not, attempt to send embed to channel and start thread if possible
        }

        // create forum thread or fallback to send message and start thread
        try {
          // try forum.threads.create (works if channel is forum)
          if (forum.threads && typeof forum.threads.create === 'function') {
            const thread = await forum.threads.create({
              name: `Заявка — ${yourName}`,
              message: {
                content: ALLOWED_ROLE_IDS.map(r => `<@&${r}>`).join(' '),
                embeds: [embed],
                components: [
                  new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`accept_${interaction.user.id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`deny_${interaction.user.id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
                  )
                ]
              }
            });
            await interaction.reply({ content: 'Заявка отправлена!', ephemeral: true });
            return;
          } else {
            // fallback: send message in channel and then start a thread (if allowed)
            const sent = await forum.send({ content: ALLOWED_ROLE_IDS.map(r => `<@&${r}>`).join(' '), embeds: [embed] });
            try {
              await sent.startThread({ name: `Заявка — ${yourName}` });
            } catch (e) { /* ignore thread creation fail */ }
            await interaction.reply({ content: 'Заявка отправлена (fallback).', ephemeral: true });
            return;
          }
        } catch (e) {
          console.error('Failed to post application:', e);
          await interaction.reply({ content: 'Ошибка при отправке заявки — проверьте права/канал.', ephemeral: true });
          return;
        }
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      if (interaction && !interaction.replied) {
        await interaction.reply({ content: 'Произошла ошибка, администратор уведомлён.', ephemeral: true });
      }
    } catch {}
  }
});

// ------------------- Simple Web Panel (Express) -------------------
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET || 'versize_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

global.oauthTokens = {};

const DISCORD_OAUTH_URL =
  'https://discord.com/api/oauth2/authorize' +
  `?client_id=${CLIENT_ID}` +
  '&response_type=code' +
  '&scope=identify%20guilds%20guilds.members.read' +
  `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI || '')}`;

async function getGuildMember(userId) {
  try {
    const token = global.oauthTokens[userId];
    if (!token) return null;
    const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

async function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  const m = await getGuildMember(req.session.user.id);
  if (!m) return res.send('<h1>Вы не состоите на сервере</h1>');
  const hasRole = (m.roles || []).some(r => ALLOWED_ROLE_IDS.includes(r));
  if (!hasRole) return res.send('<h1>Нет доступа к панели</h1>');
  next();
}

app.get('/login', (req, res) => {
  res.send(`<html><body style="background:#0d0b16;color:#fff;text-align:center;padding-top:80px;">
    <h1>Versize — Панель</h1>
    <a href="${DISCORD_OAUTH_URL}" style="padding:12px 20px;background:#7b68ee;color:white;border-radius:8px;text-decoration:none;">Войти через Discord</a>
  </body></html>`);
});

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code');
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', OAUTH_REDIRECT_URI);

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return res.send('Auth error');

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const userData = await userRes.json();
  global.oauthTokens[userData.id] = tokenData.access_token;
  req.session.user = { id: userData.id, username: userData.username, avatar: userData.avatar };
  res.redirect('/panel');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Panel home
const PANEL_CSS = `
body{margin:0;background:#0d0b16;color:#e6e6e6;font-family:Arial;}
.sidebar{width:260px;height:100vh;background:#11101a;position:fixed;left:0;top:0;padding-top:20px}
.content{margin-left:260px;padding:24px}
.card{background:#181726;padding:16px;border-radius:10px;margin-bottom:10px;border:1px solid #26233a}
a.button{background:#7b68ee;color:white;padding:8px 12px;border-radius:8px;text-decoration:none}
table{width:100%}
th,td{padding:8px;border-bottom:1px solid #2a2740}
th{color:#7b68ee}
`;

// dashboard
app.get('/panel', requireAuth, (req, res) => {
  const username = req.session.user.username;
  res.send(`<html><head><style>${PANEL_CSS}</style></head><body>
    <div class="sidebar"><h2 style="text-align:center;color:#7b68ee">VERSIZE</h2>
      <a style="color:#cfcfcf;display:block;padding:10px 18px" href="/panel">Dashboard</a>
      <a style="color:#cfcfcf;display:block;padding:10px 18px" href="/panel/applications">Заявки</a>
      <a style="color:#cfcfcf;display:block;padding:10px 18px" href="/panel/logs">Логи лидеров</a>
      <a style="color:#cfcfcf;display:block;padding:10px 18px" href="/panel/settings">Настройки</a>
      <a style="color:#cfcfcf;display:block;padding:10px 18px" href="/logout">Выйти (${username})</a>
    </div>
    <div class="content">
      <div class="card"><h3>Статус бота</h3><p>Бот: <b>${client.user?.tag || '—'}</b></p></div>
      <div class="card"><h3>Информация</h3><p>Канал заявок: <b>${APP_CHANNEL_ID || '—'}</b></p></div>
    </div>
  </body></html>`);
});

// applications list - fetch forum threads
app.get('/panel/applications', requireAuth, async (req, res) => {
  const username = req.session.user.username;
  try {
    const forum = await client.channels.fetch(APP_CHANNEL_ID).catch(() => null);
    let threadsList = [];
    if (forum && forum.threads && typeof forum.threads.fetchActive === 'function') {
      const threads = await forum.threads.fetchActive().catch(() => null);
      if (threads && threads.threads) {
        threadsList = Array.from(threads.threads.values()).map(t => ({
          id: t.id,
          name: t.name,
          ownerId: t.ownerId,
          createdAt: t.createdAt
        }));
      }
    }
    const rows = threadsList.map(t => `<tr><td>${t.name}</td><td>${t.ownerId ? `<@${t.ownerId}>` : '-'}</td><td>${t.createdAt}</td><td><a class="button" href="/api/thread/accept?id=${t.id}">Принять</a> <a class="button" style="background:#e74c3c" href="/api/thread/deny?id=${t.id}">Отклонить</a></td></tr>`).join('');
    res.send(`<html><head><style>${PANEL_CSS}</style></head><body><div style="margin-left:260px;padding:24px"><h1>Активные заявки</h1><table><tr><th>Название</th><th>Создатель</th><th>Создано</th><th>Действия</th></tr>${rows}</table></div></body></html>`);
  } catch (e) {
    console.error('/panel/applications error', e);
    res.send('<h1>Ошибка получения заявок</h1>');
  }
});

// leaders logs
app.get('/panel/logs', requireAuth, async (req, res) => {
  try {
    const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(() => null);
    let rows = '';
    if (logCh && logCh.isTextBased()) {
      const msgs = await logCh.messages.fetch({ limit: 30 }).catch(() => null);
      if (msgs) {
        rows = msgs.map(m => `<tr><td>${m.author?.username || 'bot'}</td><td>${m.embeds[0]?.title || '—'}</td><td>${m.embeds[0]?.fields?.map(f => `${f.name}: ${f.value}`).join('<br>') || ''}</td><td>${new Date(m.createdTimestamp).toLocaleString()}</td></tr>`).join('');
      }
    }
    res.send(`<html><head><style>${PANEL_CSS}</style></head><body><div style="margin-left:260px;padding:24px"><h1>Логи лидеров</h1><table><tr><th>Автор</th><th>Тип</th><th>Данные</th><th>Время</th></tr>${rows}</table></div></body></html>`);
  } catch (e) {
    console.error('/panel/logs error', e);
    res.send('<h1>Ошибка</h1>');
  }
});

// API: accept thread (web)
app.get('/api/thread/accept', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const threadId = req.query.id;
  if (!threadId) return res.send('Нет ID треда');
  try {
    const thread = await client.channels.fetch(threadId);
    if (!thread || !thread.isThread()) return res.send('Тред не найден');
    await thread.send({ embeds: [new EmbedBuilder().setTitle('✅ Заявка одобрена через панель').setDescription(`Лидер: <@${userId}>`).setColor(0x2ecc71)] }).catch(() => {});
    await thread.setArchived(true).catch(() => {});
    if (LEADERS_LOG_CHANNEL_ID) {
      const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(() => null);
      if (logCh && logCh.isTextBased()) {
        await logCh.send({ embeds: [new EmbedBuilder().setTitle('📗 Одобрение (WEB PANEL)').addFields({ name: 'Лидер', value: `<@${userId}>` }, { name: 'Тред', value: thread.name }).setColor(0x2ecc71)] }).catch(() => {});
      }
    }
    res.redirect('/panel/applications');
  } catch (e) {
    console.error('ACCEPT error', e);
    res.send('Ошибка');
  }
});

// API: deny thread (web)
app.get('/api/thread/deny', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const threadId = req.query.id;
  const reason = req.query.reason;
  if (!threadId) return res.send('Нет ID треда');
  if (!reason) {
    return res.send(`<html><body style="background:#0d0b16;color:#fff;text-align:center;padding-top:50px;"><h2>Причина отказа</h2><form><input type="hidden" name="id" value="${threadId}"><textarea name="reason" style="width:400px;height:120px"></textarea><br><button style="padding:8px 12px;background:#e74c3c;color:#fff;border-radius:8px">Отправить</button></form></body></html>`);
  }
  try {
    const thread = await client.channels.fetch(threadId).catch(() => null);
    if (!thread || !thread.isThread()) return res.send('Тред не найден');
    const embed = new EmbedBuilder().setTitle('❌ Заявка отклонена через панель').addFields({ name: 'Лидер', value: `<@${userId}>` }, { name: 'Причина', value: reason }).setColor(0xe74c3c).setTimestamp();
    await thread.send({ embeds: [embed] }).catch(() => {});
    await thread.setArchived(true).catch(() => {});
    if (LEADERS_LOG_CHANNEL_ID) {
      const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(() => null);
      if (logCh && logCh.isTextBased()) {
        await logCh.send({ embeds: [new EmbedBuilder().setTitle('📕 Отклонение (WEB PANEL)').addFields({ name: 'Лидер', value: `<@${userId}>` }, { name: 'Причина', value: reason }).setColor(0xe74c3c)] }).catch(() => {});
      }
    }
    res.redirect('/panel/applications');
  } catch (e) {
    console.error('DENY error', e);
    res.send('Ошибка');
  }
});

// Start express and login
const serverPort = parseInt(PORT || process.env.PORT || '8080', 10);
app.listen(serverPort, () => {
  console.log(`Versize Web Panel запущена на порте: ${serverPort}`);
  console.log(`Открой: http://localhost:${serverPort}/login (локально)`);
});

client.login(DISCORD_TOKEN).catch(err => {
  console.error('Discord login error', err);
});
