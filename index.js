// index.js (ESM) — бот + простая веб-панель
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
  GUILD_ID,
  APP_CHANNEL_ID,
  AUDIT_CHANNEL_ID,
  LEADERS_LOG_CHANNEL_ID,
  ALLOWED_ROLES, // comma separated role ids for mention in posts
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
  SESSION_SECRET,
  PORT
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('DISCORD_TOKEN и CLIENT_ID должны быть заданы в .env');
  process.exit(1);
}

const ALLOWED_ROLE_IDS = (ALLOWED_ROLES || '').split(',').map(s => s.trim()).filter(Boolean);

// ---------------- Discord client ----------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.once(Events.ClientReady, () => {
  console.log('Logged in as', client.user.tag);
});

// ---------- interaction handlers ----------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      // apply-panel
      if (name === 'apply-panel') {
        // permission check: allow roles from ALLOWED_ROLE_IDS or manage guild
        const member = interaction.member;
        let allowed = false;
        try {
          if (member.permissions?.has?.('ManageGuild')) allowed = true;
          // check roles
          if (!allowed && ALLOWED_ROLE_IDS.length) {
            const memberRoles = member.roles?.cache?.map(r => r.id) || [];
            allowed = memberRoles.some(r => ALLOWED_ROLE_IDS.includes(r));
          }
        } catch (e) { /* ignore */ }

        if (!allowed) {
          await interaction.reply({ content: 'У вас нет прав для публикации панели.', ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder().setTitle('✉️ Панель заявок').setDescription('Выберите тип заявки').setColor(0x7b68ee);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('apply_family').setLabel('Вступление').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('apply_restore').setLabel('Восстановление').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('apply_unblack').setLabel('Снятие ЧС').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }

      // embed
      if (name === 'embed') {
        const title = interaction.options.getString('title');
        const desc = interaction.options.getString('description');
        const color = interaction.options.getString('color') || '#7b68ee';
        const e = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color);
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

        const ACTION_MAP = {
          promote: 'Повышение',
          demote: 'Понижение',
          warn: 'Выговор',
          fire: 'Увольнение',
          give_rank: 'Выдача ранга'
        };

        const emb = new EmbedBuilder()
          .setTitle('📝 Аудит')
          .setColor(0xf1c40f)
          .addFields(
            { name: 'Действие', value: ACTION_MAP[action] || action, inline: true },
            { name: 'Кто', value: `<@${actor.id}>`, inline: true },
            { name: 'Кого', value: `<@${target.id}>`, inline: true },
            { name: 'С ранга', value: `${fromRank}`, inline: true },
            { name: 'На ранг', value: `${toRank}`, inline: true },
            { name: 'Причина', value: reason, inline: false }
          )
          .setTimestamp();

        if (!AUDIT_CHANNEL_ID) {
          await interaction.reply({ content: 'AUDIT_CHANNEL_ID не задан.', ephemeral: true });
          return;
        }
        const ch = await client.channels.fetch(AUDIT_CHANNEL_ID).catch(()=>null);
        if (!ch || !ch.isTextBased()) {
          await interaction.reply({ content: 'Канал аудита не найден или нет доступа.', ephemeral: true });
          return;
        }

        await ch.send({ embeds: [emb] }).catch(()=>{});
        await interaction.reply({ content: 'Аудит отправлен.', ephemeral: true });
        return;
      }
    } // end slash

    // Buttons
    if (interaction.isButton()) {
      // apply buttons -> show modal
      if (interaction.customId.startsWith('apply_')) {
        const type = interaction.customId.replace('apply_', '');
        const modal = new ModalBuilder().setCustomId(`apply_modal_${type}`).setTitle(
          type === 'family' ? 'Заявка — вступление' :
          type === 'restore' ? 'Заявка — восстановление' : 'Заявка — снятие ЧС'
        );

        // 5 fields max
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('your_name').setLabel('Ваше имя (OOC)').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('discord').setLabel('Discord (пример name#1234)').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ic_name').setLabel('IC: имя, фамилия, #статик').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('history').setLabel('Где состояли раньше?').setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motivation').setLabel('Почему нас?').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );

        await interaction.showModal(modal);
        return;
      }

      // accept inside thread
      if (interaction.customId.startsWith('accept_')) {
        const ch = interaction.channel;
        if (!ch.isThread()) {
          await interaction.reply({ content: 'Кнопка работает только внутри треда.', ephemeral: true });
          return;
        }
        const emb = new EmbedBuilder().setTitle('✅ Заявка одобрена').setDescription(`Лидер: <@${interaction.user.id}>`).setColor(0x2ecc71).setTimestamp();
        await ch.send({ embeds: [emb] }).catch(()=>{});
        await ch.setArchived(true).catch(()=>{});
        // leaders log
        if (LEADERS_LOG_CHANNEL_ID) {
          const log = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(()=>null);
          if (log && log.isTextBased()) {
            await log.send({ embeds: [ new EmbedBuilder().setTitle('📗 Одобрение').addFields({ name:'Лидер', value:`<@${interaction.user.id}>`}, { name:'Тред', value: ch.name }).setColor(0x2ecc71).setTimestamp() ] }).catch(()=>{});
          }
        }
        await interaction.reply({ content: 'Одобрено.', ephemeral: true });
        return;
      }

      // deny -> show modal with reason
      if (interaction.customId.startsWith('deny_')) {
        const modal = new ModalBuilder().setCustomId('deny_reason_modal').setTitle('Причина отказа')
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Причина').setStyle(TextInputStyle.Paragraph).setRequired(true)));
        await interaction.showModal(modal);
        return;
      }
    }

    // Modal submit (apply)
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'deny_reason_modal') {
        const reason = interaction.fields.getTextInputValue('reason');
        const thread = interaction.channel;
        const emb = new EmbedBuilder().setTitle('❌ Заявка отклонена').setDescription(`Причина: ${reason}\nЛидер: <@${interaction.user.id}>`).setColor(0xe74c3c).setTimestamp();
        await thread.send({ embeds: [emb] }).catch(()=>{});
        await thread.setArchived(true).catch(()=>{});
        if (LEADERS_LOG_CHANNEL_ID) {
          const log = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(()=>null);
          if (log && log.isTextBased()) {
            await log.send({ embeds: [ new EmbedBuilder().setTitle('📕 Отклонение').addFields({name:'Лидер', value:`<@${interaction.user.id}>`}, {name:'Причина', value: reason}).setColor(0xe74c3c).setTimestamp() ] }).catch(()=>{});
          }
        }
        await interaction.reply({ content: 'Отклонено.', ephemeral: true });
        return;
      }

      if (interaction.customId.startsWith('apply_modal_')) {
        const type = interaction.customId.replace('apply_modal_','');
        const yourName = interaction.fields.getTextInputValue('your_name');
        const discordTag = interaction.fields.getTextInputValue('discord');
        const ic = interaction.fields.getTextInputValue('ic_name');
        const history = interaction.fields.getTextInputValue('history');
        const motivation = interaction.fields.getTextInputValue('motivation');

        // validation
        const errors = [];
        if (!yourName || yourName.length < 2) errors.push('Имя слишком короткое');
        if (!discordTag || (!discordTag.includes('#') && !discordTag.includes('@'))) errors.push('Discord неверен');
        if (!ic || ic.length < 3) errors.push('IC слишком короткое');
        if (!history || history.length < 8) errors.push('История слишком короткая');
        if (!motivation || motivation.length < 8) errors.push('Мотивация слишком короткая');

        if (errors.length) {
          await interaction.reply({ content: '❌ Ошибки:\n' + errors.map(s=>'• '+s).join('\n'), ephemeral: true });
          return;
        }

        // create embed and forum post
        const embed = new EmbedBuilder()
          .setTitle(type === 'family' ? '📩 Заявка — вступление' : type === 'restore' ? '📩 Заявка — восстановление' : '📩 Заявка — снятие ЧС')
          .setColor(0x7b68ee)
          .addFields(
            { name: 'Имя (OOC)', value: yourName, inline: true },
            { name: 'Discord', value: discordTag, inline: true },
            { name: 'IC', value: ic, inline: false },
            { name: 'История', value: history, inline: false },
            { name: 'Мотивация', value: motivation, inline: false }
          ).setFooter({ text: 'Versize — заявка' }).setTimestamp();

        if (!APP_CHANNEL_ID) {
          await interaction.reply({ content: 'APP_CHANNEL_ID не задан в .env', ephemeral: true });
          return;
        }
        const forum = await client.channels.fetch(APP_CHANNEL_ID).catch(()=>null);
        if (!forum) {
          await interaction.reply({ content: 'Канал заявок не найден.', ephemeral: true });
          return;
        }

        // create forum post (message in forum -> thread)
        const mention = ALLOWED_ROLE_IDS.length ? ALLOWED_ROLE_IDS.map(r=>`<@&${r}>`).join(' ') : '';
        try {
          const created = await forum.threads.create({
            name: `Заявка — ${yourName}`.slice(0,100),
            message: {
              content: mention,
              embeds: [embed],
              components: [ new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`accept_${interaction.user.id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`deny_${interaction.user.id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
              ) ]
            }
          });
          await interaction.reply({ content: 'Заявка отправлена (форум).', ephemeral: true });
        } catch (e) {
          console.error('Forum create error', e);
          await interaction.reply({ content: 'Ошибка при создании поста в форуме (проверьте права/тип канала).', ephemeral: true });
        }

        return;
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try { if (interaction && !interaction.replied) await interaction.reply({ content: 'Произошла ошибка.', ephemeral: true }); } catch {}
  }
});

// --------------- Express web panel (simple) ----------------
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({ secret: SESSION_SECRET || 'versize_secret', resave: false, saveUninitialized: false, cookie: { maxAge: 1000*60*60*12 }}));

// very simple auth using Discord OAuth2 (optional, only if OAUTH_CLIENT_ID etc set)
const DISCORD_OAUTH_URL = `https://discord.com/api/oauth2/authorize?client_id=${OAUTH_CLIENT_ID || CLIENT_ID}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI || 'http://localhost:8080/oauth/callback')}&response_type=code&scope=identify%20guilds%20guilds.members.read`;

global.oauthTokens = {};

async function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  // minimal check
  next();
}

app.get('/', (req,res)=> res.redirect('/panel'));
app.get('/login', (req,res) => {
  res.send(`<html><body style="font-family:Arial;background:#0b0b12;color:#fff;padding:40px"><h1>Versize Panel</h1><a href="${DISCORD_OAUTH_URL}" style="background:#7b68ee;padding:10px 15px;color:#fff;border-radius:6px">Войти через Discord</a></body></html>`);
});

app.get('/panel', requireAuth, (req,res) => {
  res.send(`<html><body style="font-family:Arial">Панель — бот: ${client.user?.tag || 'offline'} <br/><a href="/panel/applications">Заявки</a> | <a href="/logout">Выйти</a></body></html>`);
});

app.get('/panel/applications', requireAuth, async (req,res) => {
  if (!APP_CHANNEL_ID) return res.send('APP_CHANNEL_ID не задан.');
  const forum = await client.channels.fetch(APP_CHANNEL_ID).catch(()=>null);
  if (!forum) return res.send('Форум канал не найден.');
  const threads = await forum.threads.fetchActive().catch(()=>({ threads: new Map() }));
  const rows = Array.from((threads.threads || new Map()).values()).map(t => `<tr><td>${t.name}</td><td>${t.ownerId || '-'}</td><td>${new Date(t.createdTimestamp).toLocaleString()}</td><td><a href="/api/thread/accept?id=${t.id}">Принять</a> | <a href="/api/thread/deny?id=${t.id}">Отклонить</a></td></tr>`).join('');
  res.send(`<html><body><h1>Активные заявки</h1><table border="1" cellpadding="6"><tr><th>Название</th><th>Создатель</th><th>Дата</th><th>Действия</th></tr>${rows}</table></body></html>`);
});

app.get('/api/thread/accept', requireAuth, async (req,res) => {
  const threadId = req.query.id;
  if (!threadId) return res.send('Нет id');
  const thread = await client.channels.fetch(threadId).catch(()=>null);
  if (!thread || !thread.isThread()) return res.send('Тред не найден');
  await thread.send({ embeds: [ new EmbedBuilder().setTitle('✅ Принято (WEB)').setDescription(`Лидер: ${req.session.user?.username || 'web'}`).setColor(0x2ecc71) ] }).catch(()=>{});
  await thread.setArchived(true).catch(()=>{});
  if (LEADERS_LOG_CHANNEL_ID) {
    const log = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(()=>null);
    if (log && log.isTextBased()) await log.send({ embeds: [ new EmbedBuilder().setTitle('📗 Одобрение (WEB)').addFields({name:'Автор', value: req.session.user?.username || 'web'}).setColor(0x2ecc71) ] }).catch(()=>{});
  }
  res.redirect('/panel/applications');
});

app.get('/api/thread/deny', requireAuth, async (req,res) => {
  const threadId = req.query.id;
  if (!threadId) return res.send('Нет id');
  if (!req.query.reason) {
    return res.send(`<form><input type="hidden" name="id" value="${threadId}"><textarea name="reason" placeholder="Причина"></textarea><br><button type="submit">Отправить</button></form>`);
  }
  const reason = req.query.reason;
  const thread = await client.channels.fetch(threadId).catch(()=>null);
  if (!thread || !thread.isThread()) return res.send('Тред не найден');
  await thread.send({ embeds: [ new EmbedBuilder().setTitle('❌ Отклонено (WEB)').setDescription(`Причина: ${reason}`).setColor(0xe74c3c) ] }).catch(()=>{});
  await thread.setArchived(true).catch(()=>{});
  if (LEADERS_LOG_CHANNEL_ID) {
    const log = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID).catch(()=>null);
    if (log && log.isTextBased()) await log.send({ embeds: [ new EmbedBuilder().setTitle('📕 Отклонение (WEB)').addFields({name:'Автор', value: req.session.user?.username || 'web'}, {name:'Причина', value: reason}).setColor(0xe74c3c) ] }).catch(()=>{});
  }
  res.redirect('/panel/applications');
});

// minimal oauth callback (stores tokens)
app.get('/oauth/callback', async (req,res) => {
  const code = req.query.code;
  if (!code) return res.send('No code');
  // exchange
  const params = new URLSearchParams();
  params.append('client_id', OAUTH_CLIENT_ID || CLIENT_ID);
  params.append('client_secret', OAUTH_CLIENT_SECRET || '');
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', OAUTH_REDIRECT_URI || 'http://localhost:8080/oauth/callback');

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', { method:'POST', body: params, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }});
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) return res.send('Auth error');

  const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenJson.access_token}` }});
  const user = await userRes.json();
  global.oauthTokens[user.id] = tokenJson.access_token;
  req.session.user = { id: user.id, username: user.username };
  res.redirect('/panel');
});

app.get('/logout', (req,res) => { req.session.destroy(()=>res.redirect('/login')); });

// start server
const httpPort = process.env.PORT || PORT || 8080;
app.listen(httpPort, () => {
  console.log(`Versize Web Panel запущена на порту ${httpPort}`);
  console.log(`If running locally open: http://localhost:${httpPort}/login`);
});

// login bot
client.login(DISCORD_TOKEN).catch(err => {
  console.error('Discord login error', err);
  process.exit(1);
});
