// ================================================================
//  V E R S I Z E   B O T   —   ЧАСТЬ 1 (Discord Core)
// ================================================================
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
  ChannelType
} from "discord.js";

import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

// ---------------------------------------------------------
//   .env переменные
// ---------------------------------------------------------
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
  SESSION_SECRET
} = process.env;

// Роли, которые могут входить в панель
const ALLOWED_ROLE_IDS = (ALLOWED_ROLES || "")
  .split(",")
  .map(r => r.trim())
  .filter(Boolean);

// ---------------------------------------------------------
//  Создаём Discord клиента
// ---------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// ---------------------------------------------------------
//  Slash-команды (включая панели, embed, audit)
// ---------------------------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName("apply-panel")
    .setDescription("Отправить панель заявок"),

  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Создать эмбэд")
    .addStringOption(o =>
      o.setName("title").setDescription("Заголовок").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("description").setDescription("Описание").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("color").setDescription("Цвет #hex").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("audit")
    .setDescription("Создать запись аудита")
    .addUserOption(o =>
      o.setName("author").setDescription("Кто совершил действие").setRequired(true)
    )
    .addUserOption(o =>
      o.setName("target").setDescription("Кого касается действие").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("action")
        .setDescription("Тип действия")
        .setRequired(true)
        .addChoices(
          { name: "Повышение", value: "promote" },
          { name: "Понижение", value: "demote" },
          { name: "Выговор", value: "warn" },
          { name: "Увольнение", value: "fire" },
          { name: "Выдача ранга", value: "give_rank" }
        )
    )
    .addStringOption(o =>
      o.setName("from_rank")
        .setDescription("С какого ранга")
        .addChoices(
          { name: "8 — Generalisimus", value: "8" },
          { name: "7 — Vice Gen.", value: "7" },
          { name: "6 — Gen. Secretary", value: "6" },
          { name: "5 — Curator", value: "5" },
          { name: "4 — Curator's Office", value: "4" },
          { name: "3 — Stacked", value: "3" },
          { name: "2 — Main", value: "2" },
          { name: "1 — NewBie", value: "1" }
        )
    )
    .addStringOption(o =>
      o.setName("to_rank")
        .setDescription("На какой ранг")
        .addChoices(
          { name: "8 — Generalisimus", value: "8" },
          { name: "7 — Vice Gen.", value: "7" },
          { name: "6 — Gen. Secretary", value: "6" },
          { name: "5 — Curator", value: "5" },
          { name: "4 — Curator's Office", value: "4" },
          { name: "3 — Stacked", value: "3" },
          { name: "2 — Main", value: "2" },
          { name: "1 — NewBie", value: "1" }
        )
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Причина").setRequired(false)
    )
].map(cmd => cmd.toJSON());

// ---------------------------------------------------------
//  Регистрация слэш-команд
// ---------------------------------------------------------
(async () => {
  try {
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("Slash commands registered for guild", GUILD_ID);
  } catch (err) {
    console.error("Slash registration error:", err);
  }
})();

// ---------------------------------------------------------
//  READY
// ---------------------------------------------------------
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// =======================================================================
//              ИНТЕРАКЦИИ DISCORD — Часть 1 (полностью рабочая)
// =======================================================================
client.on(Events.InteractionCreate, async interaction => {
  try {
    // ================================================================
    //                      SLASH COMMANDS
    // ================================================================
    if (interaction.isChatInputCommand()) {
      // ------- APPLY PANEL -------
      if (interaction.commandName === "apply-panel") {
        const embed = new EmbedBuilder()
          .setTitle("💼 Versize — Панель заявок")
          .setDescription("Выберите тип заявки ниже:")
          .setColor(0x7b68ee);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("apply_family")
            .setLabel("Вступление")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("apply_restore")
            .setLabel("Восстановление")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("apply_unblack")
            .setLabel("Снятие ЧС")
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }

      // ------- EMBED -------
      if (interaction.commandName === "embed") {
        const title = interaction.options.getString("title");
        const description = interaction.options.getString("description");
        const color = interaction.options.getString("color") || "#7b68ee";

        const e = new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(color);

        await interaction.reply({ embeds: [e] });
        return;
      }

      // ------- AUDIT -------
      if (interaction.commandName === "audit") {
        const actor = interaction.options.getUser("author");
        const target = interaction.options.getUser("target");
        const action = interaction.options.getString("action");
        const fromRank = interaction.options.getString("from_rank") || "—";
        const toRank = interaction.options.getString("to_rank") || "—";
        const reason = interaction.options.getString("reason") || "—";

        const ACTION_MAP = {
          promote: "Повышение",
          demote: "Понижение",
          warn: "Выговор",
          fire: "Увольнение",
          give_rank: "Выдача ранга"
        };

        const embed = new EmbedBuilder()
          .setTitle("📘 Аудит действия")
          .setColor(0x7b68ee)
          .addFields(
            { name: "Действие", value: ACTION_MAP[action], inline: true },
            { name: "Кто", value: `<@${actor.id}>`, inline: true },
            { name: "Кого", value: `<@${target.id}>`, inline: true },
            { name: "С ранга", value: fromRank, inline: true },
            { name: "На ранг", value: toRank, inline: true },
            { name: "Причина", value: reason }
          )
          .setTimestamp();

        const ch = await client.channels.fetch(AUDIT_CHANNEL_ID);
        await ch.send({ embeds: [embed] });

        await interaction.reply({ content: "Аудит записан.", ephemeral: true });
        return;
      }
    }

    // ================================================================
    //                            BUTTONS
    // ================================================================
    if (interaction.isButton()) {
      // --------------------- МОДАЛ ЗАЯВОК ---------------------
      if (interaction.customId.startsWith("apply_")) {
        const type = interaction.customId.replace("apply_", "");

        const modal = new ModalBuilder()
          .setCustomId(`apply_modal_${type}`)
          .setTitle(
            type === "family"
              ? "Заявка — вступление"
              : type === "restore"
              ? "Заявка — восстановление"
              : "Заявка — снятие ЧС"
          );

        // Только 5 полей (макс лимит Discord)
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("your_name")
              .setLabel("Ваше имя (OOC)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("discord")
              .setLabel("Ваш Discord")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ic_name")
              .setLabel("IC Имя, Фамилия, #статик")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("history")
              .setLabel("Где состояли раньше?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("motivation")
              .setLabel("Почему выбираете нас?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      // ------------------- ACCEPT -------------------
      if (interaction.customId.startsWith("accept_")) {
        const thread = interaction.channel;

        if (!thread.isThread())
          return interaction.reply({
            content: "Кнопка работает только внутри тредов.",
            ephemeral: true
          });

        // Ответ
        const embed = new EmbedBuilder()
          .setTitle("✅ Заявка одобрена")
          .setDescription(`Лидер: <@${interaction.user.id}>`)
          .setColor(0x2ecc71)
          .setTimestamp();

        await thread.send({ embeds: [embed] });
        await thread.setArchived(true).catch(() => {});

        // Лог
        if (LEADERS_LOG_CHANNEL_ID) {
          const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID);
          await logCh.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("📗 Одобрение заявки")
                .addFields(
                  { name: "Лидер", value: `<@${interaction.user.id}>` },
                  { name: "Тред", value: thread.name }
                )
                .setColor(0x2ecc71)
            ]
          });
        }

        await interaction.reply({ content: "Одобрено.", ephemeral: true });
        return;
      }

      // ------------------- DENY -------------------
      if (interaction.customId.startsWith("deny_")) {
        const modal = new ModalBuilder()
          .setCustomId("deny_reason_modal")
          .setTitle("Причина отклонения")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Причина отказа")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );

        await interaction.showModal(modal);
        return;
      }
    }

    // ================================================================
    //                      MODAL SUBMIT (ЗАЯВКИ)
    // ================================================================
    if (interaction.isModalSubmit()) {
      // ---------- ОТКЛОНЕНИЕ ----------
      if (interaction.customId === "deny_reason_modal") {
        const reason = interaction.fields.getTextInputValue("reason");
        const thread = interaction.channel;

        const embed = new EmbedBuilder()
          .setTitle("❌ Заявка отклонена")
          .setDescription(
            `Причина: **${reason}**\nЛидер: <@${interaction.user.id}>`
          )
          .setColor(0xe74c3c)
          .setTimestamp();

        await thread.send({ embeds: [embed] });
        await thread.setArchived(true).catch(() => {});

        if (LEADERS_LOG_CHANNEL_ID) {
          const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID);
          await logCh.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("📕 Отклонение заявки")
                .addFields(
                  { name: "Лидер", value: `<@${interaction.user.id}>` },
                  { name: "Причина", value: reason }
                )
                .setColor(0xe74c3c)
            ]
          });
        }

        await interaction.reply({ content: "Заявка отклонена.", ephemeral: true });
        return;
      }

      // ---------- ОСНОВНОЙ МОДАЛ ЗАЯВКИ ----------
      if (interaction.customId.startsWith("apply_modal_")) {
        const type = interaction.customId.replace("apply_modal_", "");

        const yourName   = interaction.fields.getTextInputValue("your_name");
        const discord    = interaction.fields.getTextInputValue("discord");
        const ic         = interaction.fields.getTextInputValue("ic_name");
        const history    = interaction.fields.getTextInputValue("history");
        const motivation = interaction.fields.getTextInputValue("motivation");

        // ------- Проверка -------
        const errors = [];
        if (yourName.length < 2) errors.push("Имя слишком короткое.");
        if (!discord.includes("#") && !discord.includes("@"))
          errors.push("Discord указан неверно.");
        if (ic.length < 5) errors.push("IC слишком короткое.");
        if (history.length < 10) errors.push("История слишком короткая.");
        if (motivation.length < 10) errors.push("Мотивация слишком короткая.");

        if (errors.length > 0) {
          await interaction.reply({
            content: "❌ Ошибки:\n" + errors.map(e => `• ${e}`).join("\n"),
            ephemeral: true
          });
          return;
        }

        // ------- Конструирование Embed -------
        const embed = new EmbedBuilder()
          .setTitle(
            type === "family"
              ? "📩 Заявка на вступление"
              : type === "restore"
              ? "📩 Заявка на восстановление"
              : "📩 Заявка на снятие ЧС"
          )
          .setColor(0x7b68ee)
          .addFields(
            { name: "Имя (OOC)", value: yourName },
            { name: "Discord", value: discord },
            { name: "IC данные", value: ic },
            { name: "История", value: history },
            { name: "Мотивация", value: motivation }
          );

        const forum = await client.channels.fetch(APP_CHANNEL_ID);

        // Создаём пост в форуме
        const thread = await forum.threads.create({
          name: `Заявка — ${yourName}`,
          message: {
            content: ALLOWED_ROLE_IDS.map(r => `<@&${r}>`).join(" "),
            embeds: [embed],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`accept_${interaction.user.id}`)
                  .setLabel("Принять")
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId(`deny_${interaction.user.id}`)
                  .setLabel("Отклонить")
                  .setStyle(ButtonStyle.Danger)
              )
            ]
          }
        });

        await interaction.reply({ content: "Заявка отправлена!", ephemeral: true });
        return;
      }
    }
  } catch (err) {
    console.error("Interaction error:", err);
  }
});
// ================================================================
//  V E R S I Z E   B O T   —   ЧАСТЬ 2 (Express + OAuth2)
// ================================================================

// ---------------------- EXPRESS APP -----------------------------
const app = express();

// парсим формы / json
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// cookies
app.use(cookieParser());

// sessions
app.use(
  session({
    secret: SESSION_SECRET || "versize_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 12, // 12 часов
      httpOnly: true,
    },
  })
);

// ---------------------- Discord OAuth2 --------------------------
const DISCORD_OAUTH_URL =
  "https://discord.com/api/oauth2/authorize"
  + `?client_id=${CLIENT_ID}`
  + "&response_type=code"
  + "&scope=identify%20guilds%20guilds.members.read"
  + `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}`;

// ---------------------- МИДДЛВАР ДЛЯ ЗАЩИТЫ ---------------------
async function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  // проверяем состоит ли пользователь в гильдии
  const guildMember = await getGuildMember(req.session.user.id);

  if (!guildMember) {
    return res.send(`<h1>Вы не состоите на сервере.</h1>`);
  }

  // проверяем есть ли нужная роль
  const hasRole = guildMember.roles.some(r => ALLOWED_ROLE_IDS.includes(r));

  if (!hasRole) {
    return res.send(`<h1>У вас нет прав доступа к панели.</h1>`);
  }

  next();
}

// ---------------------- ФУНКЦИЯ: получить данные члена гильдии ----
async function getGuildMember(userId) {
  try {
    const res = await fetch(
      `https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`,
      {
        headers: { Authorization: `Bearer ${global.oauthTokens[userId]}` }
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    return data;
  } catch (e) {
    return null;
  }
}

// Хранилище токенов
global.oauthTokens = {};


// ================================================================
//   РОУТЫ ВЕБ-ПАНЕЛИ — ЛОГИН / CALLBACK / LOGOUT
// ================================================================

// ---------------------- LOGIN ---------------------
app.get("/login", (req, res) => {
  res.send(`
    <html>
      <body style="background:black; color:white; font-family:Arial; text-align:center; padding-top:70px;">
        <h1>Versize — Панель</h1>
        <a href="${DISCORD_OAUTH_URL}" 
           style="padding:15px 25px; background:#7b68ee; border-radius:8px; color:white; text-decoration:none; font-size:20px;">
          Войти через Discord
        </a>
      </body>
    </html>
  `);
});

// ---------------------- CALLBACK ---------------------
app.get("/oauth/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("Нет кода авторизации.");

  // обмениваем код на токены
  const params = new URLSearchParams();
  params.append("client_id", CLIENT_ID);
  params.append("client_secret", CLIENT_SECRET);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", OAUTH_REDIRECT_URI);

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    body: params,
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return res.send("Ошибка авторизации.");
  }

  // получаем данные пользователя
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });

  const userData = await userRes.json();

  // сохраняем токен
  global.oauthTokens[userData.id] = tokenData.access_token;

  // сохраняем сессию
  req.session.user = {
    id: userData.id,
    username: userData.username,
    avatar: userData.avatar
  };

  res.redirect("/panel");
});

// ---------------------- LOGOUT ---------------------
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});
// ================================================================
//  V E R S I Z E   B O T   —   ЧАСТЬ 3 (WEB PANEL UI — HTML+CSS)
// ================================================================

// Глобальный стиль (Versize Purple UI)
const PANEL_CSS = `
  body {
    margin: 0;
    background: #0d0b16;
    color: #e6e6e6;
    font-family: 'Segoe UI', sans-serif;
  }
  a { color: #7b68ee; text-decoration: none; }
  .sidebar {
    width: 260px;
    height: 100vh;
    background: #11101a;
    padding-top: 30px;
    position: fixed;
    left: 0; top: 0;
  }
  .sidebar h2 {
    text-align: center;
    font-size: 26px;
    margin-bottom: 20px;
    color: #7b68ee;
  }
  .sidebar a.menu {
    display: block;
    padding: 14px 20px;
    font-size: 18px;
    color: #cfcfcf;
    border-left: 4px solid transparent;
  }
  .sidebar a.menu:hover {
    background: #181726;
    border-left: 4px solid #7b68ee;
    color: white;
  }
  .content {
    margin-left: 260px;
    padding: 40px;
  }
  .card {
    background: #181726;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
    border: 1px solid #26233a;
  }
  .card h3 { margin-top: 0; }
  .button {
    background: #7b68ee;
    color: white;
    padding: 10px 15px;
    border-radius: 8px;
    display: inline-block;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: #181726;
  }
  th, td {
    padding: 12px;
    border-bottom: 1px solid #2a2740;
  }
  th {
    background: #151421;
    color: #7b68ee;
    text-align: left;
  }
`;

// ------------------------ SIDEBAR HTML --------------------------
function sidebarHTML(username) {
  return `
    <div class="sidebar">
      <h2>VERSIZE</h2>
      <a class="menu" href="/panel">📊 Dashboard</a>
      <a class="menu" href="/panel/applications">📨 Заявки</a>
      <a class="menu" href="/panel/logs">📘 Логи лидеров</a>
      <a class="menu" href="/panel/settings">⚙️ Настройки</a>
      <a class="menu" href="/logout">🚪 Выйти (${username})</a>
    </div>
  `;
}

// ================================================================
//                      DASHBOARD / PANEL HOME
// ================================================================
app.get("/panel", requireAuth, async (req, res) => {
  const username = req.session.user.username;

  res.send(`
    <html>
    <head><style>${PANEL_CSS}</style></head>
    <body>

      ${sidebarHTML(username)}

      <div class="content">
        <h1>📊 Панель управления Versize</h1>

        <div class="card">
          <h3>⚡ Статус бота</h3>
          <p>Бот онлайн: <b>${client.user.tag}</b></p>
          <p>Uptime: ${(client.uptime / 1000 / 60).toFixed(1)} минут</p>
        </div>

        <div class="card">
          <h3>📨 Статистика заявок</h3>
          <p>Канал форума: <b>${APP_CHANNEL_ID}</b></p>
        </div>

      </div>

    </body>
    </html>
  `);
});

// ================================================================
//                       APPLICATIONS PAGE
// ================================================================
app.get("/panel/applications", requireAuth, async (req, res) => {
  const username = req.session.user.username;

  // Получаем активные треды форума
  let forum = await client.channels.fetch(APP_CHANNEL_ID);
  let threads = await forum.threads.fetchActive();

  const items = threads.threads.map(t => `
      <tr>
        <td>${t.name}</td>
        <td>${t.ownerId ? `<@${t.ownerId}>` : "-"}</td>
        <td>${new Date(t.createdTimestamp).toLocaleString()}</td>
        <td>
          <a class="button" href="/api/thread/accept?id=${t.id}">Принять</a>
          <a class="button" style="background:#e74c3c" href="/api/thread/deny?id=${t.id}">Отклонить</a>
        </td>
      </tr>
    `).join("");

  res.send(`
    <html>
    <head><style>${PANEL_CSS}</style></head>
    <body>

      ${sidebarHTML(username)}

      <div class="content">
        <h1>📨 Активные заявки</h1>

        <div class="card">
          <table>
            <tr>
              <th>Название</th>
              <th>Создатель</th>
              <th>Создано</th>
              <th>Действия</th>
            </tr>
            ${items}
          </table>
        </div>

      </div>

    </body>
    </html>
  `);
});

// ================================================================
//                      LEADER LOGS PAGE
// ================================================================
app.get("/panel/logs", requireAuth, async (req, res) => {
  const username = req.session.user.username;

  const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID);
  const msgs = await logCh.messages.fetch({ limit: 30 });

  const logRows = msgs.map(m => `
      <tr>
        <td>${m.author?.username || "bot"}</td>
        <td>${m.embeds[0]?.title || "—"}</td>
        <td>${m.embeds[0]?.fields?.map(f => `${f.name}: ${f.value}`).join("<br>") || ""}</td>
        <td>${new Date(m.createdTimestamp).toLocaleString()}</td>
      </tr>
    `).join("");

  res.send(`
    <html>
    <head><style>${PANEL_CSS}</style></head>
    <body>

      ${sidebarHTML(username)}

      <div class="content">
        <h1>📘 Логи лидеров</h1>

        <div class="card">
          <table>
            <tr>
              <th>Автор</th>
              <th>Тип</th>
              <th>Данные</th>
              <th>Время</th>
            </tr>
            ${logRows}
          </table>
        </div>

      </div>

    </body>
    </html>
  `);
});

// ================================================================
//                      SETTINGS PAGE
// ================================================================
app.get("/panel/settings", requireAuth, async (req, res) => {
  const username = req.session.user.username;

  res.send(`
    <html>
    <head><style>${PANEL_CSS}</style></head>
    <body>

      ${sidebarHTML(username)}

      <div class="content">
          <h1>⚙️ Настройки</h1>

          <div class="card">
            <h3>Информация</h3>
            <p>Роли доступа: <b>${ALLOWED_ROLE_IDS.join(", ")}</b></p>
            <p>Канал заявок (Forum): <b>${APP_CHANNEL_ID}</b></p>
            <p>Канал логов: <b>${LEADERS_LOG_CHANNEL_ID}</b></p>
          </div>

      </div>

    </body>
    </html>
  `);
});
// ================================================================
//  V E R S I Z E   B O T   —   ЧАСТЬ 4 (API ENDPOINTS)
// ================================================================

// ------------------------ API: ACCEPT THREAD ---------------------
app.get("/api/thread/accept", requireAuth, async (req, res) => {
  const username = req.session.user.username;
  const userId   = req.session.user.id;
  const threadId = req.query.id;

  if (!threadId) return res.send("Нет ID треда.");

  try {
    const thread = await client.channels.fetch(threadId);

    if (!thread || !thread.isThread()) {
      return res.send("Это не тред или бот не видит его.");
    }

    // embed "accepted"
    const embed = new EmbedBuilder()
      .setTitle("✅ Заявка одобрена через панель")
      .setDescription(`Лидер: <@${userId}>`)
      .setColor(0x2ecc71)
      .setTimestamp();

    await thread.send({ embeds: [embed] }).catch(() => {});

    await thread.setArchived(true).catch(() => {});

    // лог лидеров
    if (LEADERS_LOG_CHANNEL_ID) {
      const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID);
      await logCh.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("📗 Одобрение (WEB PANEL)")
            .addFields(
              { name: "Лидер", value: `<@${userId}>` },
              { name: "Тред", value: thread.name }
            )
            .setColor(0x2ecc71)
            .setTimestamp()
        ]
      });
    }

    res.redirect("/panel/applications");
  } catch (err) {
    console.error("ACCEPT ERROR:", err);
    res.send("Ошибка обработки.");
  }
});

// ------------------------ API: DENY THREAD -----------------------
app.get("/api/thread/deny", requireAuth, async (req, res) => {
  const username = req.session.user.username;
  const userId   = req.session.user.id;
  const threadId = req.query.id;

  if (!threadId) return res.send("Нет ID треда.");

  // Страница ввода причины
  if (!req.query.reason) {
    return res.send(`
      <html>
      <head><style>${PANEL_CSS}</style></head>
      <body>

        <div style="padding:50px; text-align:center;">
          <h1>❌ Причина отказа</h1>
          <form method="GET" action="/api/thread/deny">
            <input type="hidden" name="id" value="${threadId}">
            <textarea name="reason" style="width:400px; height:150px; border-radius:10px; padding:10px;"></textarea><br><br>
            <button class="button" style="background:#e74c3c; font-size:18px;">Отправить</button>
          </form>
        </div>

      </body>
      </html>
    `);
  }

  const reason = req.query.reason;

  try {
    const thread = await client.channels.fetch(threadId);

    if (!thread || !thread.isThread()) {
      return res.send("Это не тред или бот не видит его.");
    }

    const embed = new EmbedBuilder()
      .setTitle("❌ Заявка отклонена через панель")
      .addFields(
        { name: "Лидер", value: `<@${userId}>` },
        { name: "Причина", value: reason }
      )
      .setColor(0xe74c3c)
      .setTimestamp();

    await thread.send({ embeds: [embed] }).catch(() => {});
    await thread.setArchived(true).catch(() => {});

    // лог лидеров
    if (LEADERS_LOG_CHANNEL_ID) {
      const logCh = await client.channels.fetch(LEADERS_LOG_CHANNEL_ID);
      await logCh.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("📕 Отклонение (WEB PANEL)")
            .addFields(
              { name: "Лидер", value: `<@${userId}>` },
              { name: "Причина", value: reason }
            )
            .setColor(0xe74c3c)
            .setTimestamp()
        ]
      });
    }

    res.redirect("/panel/applications");
  } catch (err) {
    console.error("DENY ERROR:", err);
    res.send("Ошибка обработки.");
  }
});
// ================================================================
//  V E R S I Z E   B O T   —   ЧАСТЬ 5 (START SERVER + BOT LOGIN)
// ================================================================

// ------------------------ Express server start -------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌐 Versize Web Panel запущена на порте: ${PORT}`);
  console.log(`Переходи: http://localhost:${PORT}/login`);
});

// ------------------------ Discord Bot Login ----------------------
client.login(DISCORD_TOKEN).catch(err => {
  console.error("❌ Ошибка авторизации Discord:", err);
});
