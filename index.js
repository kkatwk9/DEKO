// index.js (CommonJS)
// Требует: discord.js v14+, dotenv, node >=14+
// Убедись, что в package.json НЕ стоит "type":"module" (или поставь "commonjs")

require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Collection,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // strongly recommended
const AUDIT_CHANNEL_ID = process.env.AUDIT_CHANNEL_ID;
const APP_CHANNEL_ID = process.env.APP_CHANNEL_ID || null;
const PING_ROLES = (process.env.PING_ROLES || '').split(',').filter(Boolean);

if (!TOKEN || !CLIENT_ID) {
  console.error('Нужно задать DISCORD_TOKEN и CLIENT_ID в .env или переменных Railway');
  process.exit(1);
}

// --- Команды для регистрации
const commands = [
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Создать эмбэд (заголовок, текст, цвет, футер)')
    .addStringOption(opt => opt.setName('title').setDescription('Заголовок').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Текст описания').setRequired(true))
    .addStringOption(opt => opt.setName('color').setDescription('Цвет в hex (например: #ff00aa) или number').setRequired(false))
    .addStringOption(opt => opt.setName('footer').setDescription('Футер').setRequired(false))
    .addBooleanOption(opt => opt.setName('pingroles').setDescription('Пинговать роли из PING_ROLES?').setRequired(false)),
  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Записать запись в аудит — выбрать действие, ранги и причину')
    .addUserOption(opt => opt.setName('target').setDescription('Пользователь, над которым действие').setRequired(true))
    .addStringOption(opt => opt.setName('action').setDescription('Действие').setRequired(true)
      .addChoices(
        { name: 'Promotion (повышение)', value: 'promotion' },
        { name: 'Demotion (понижение)', value: 'demotion' },
        { name: 'Warning (выговор)', value: 'warning' },
        { name: 'Termination (увольнение)', value: 'termination' },
        { name: 'Other (другое)', value: 'other' },
      ))
    .addStringOption(opt => opt.setName('from_rank').setDescription('От ранга').setRequired(false)
      .addChoices(
        { name: '8 — Generalisimus', value: '8' },
        { name: '7 — Vice Gen.', value: '7' },
        { name: '6 — Gen. Secretary', value: '6' },
        { name: '5 — Curator', value: '5' },
        { name: '4 — Curator\'s Office', value: '4' },
        { name: '3 — Stacked', value: '3' },
        { name: '2 — Main', value: '2' },
        { name: '1 — NewBie', value: '1' },
      ))
    .addStringOption(opt => opt.setName('to_rank').setDescription('До ранга').setRequired(false)
      .addChoices(
        { name: '8 — Generalisimus', value: '8' },
        { name: '7 — Vice Gen.', value: '7' },
        { name: '6 — Gen. Secretary', value: '6' },
        { name: '5 — Curator', value: '5' },
        { name: '4 — Curator\'s Office', value: '4' },
        { name: '3 — Stacked', value: '3' },
        { name: '2 — Main', value: '2' },
        { name: '1 — NewBie', value: '1' },
      ))
    .addStringOption(opt => opt.setName('reason').setDescription('Причина').setRequired(false)
      .addChoices(
        { name: 'Нарушение правил', value: 'rule_break' },
        { name: 'Хорошая игра/активность', value: 'good_activity' },
        { name: 'Отсутствие', value: 'absence' },
        { name: 'По просьбе', value: 'by_request' },
        { name: 'Другое', value: 'other_reason' },
      ))
    .addStringOption(opt => opt.setName('note').setDescription('Доп. заметки').setRequired(false)),
  new SlashCommandBuilder()
    .setName('apply-panel')
    .setDescription('Разместить панель заявок (бот отправит сообщение с кнопкой)')
].map(c => c.toJSON());

// --- Регистрация команд (guild если GUILD_ID есть)
(async () => {
  try {
    console.log('Registering slash commands...');
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('Commands registered to GUILD', GUILD_ID);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Commands registered globally (may take up to 1 hour)');
    }
  } catch (err) {
    console.error('Ошибка при регистрации команд:', err);
  }
})();

// --- Клиент
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// --- In-memory summary counters (runtime only)
const auditSummary = new Map(); // key: userId, value: { promotion: n, demotion: n, warning: n, termination: n }

function ensureSummaryFor(userId) {
  if (!auditSummary.has(userId)) {
    auditSummary.set(userId, { promotion: 0, demotion: 0, warning: 0, termination: 0 });
  }
  return auditSummary.get(userId);
}

function rankLabel(value) {
  switch (value) {
    case '8': return '8 — Generalisimus';
    case '7': return '7 — Vice Gen.';
    case '6': return '6 — Gen. Secretary';
    case '5': return '5 — Curator';
    case '4': return "4 — Curator's Office";
    case '3': return '3 — Stacked';
    case '2': return '2 — Main';
    case '1': return '1 — NewBie';
    default: return '—';
  }
}

// --- Обработка слэш-команд
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // --- EMBED
    if (commandName === 'embed') {
      const title = interaction.options.getString('title', true);
      const desc = interaction.options.getString('description', true);
      const colorRaw = interaction.options.getString('color', false);
      const footer = interaction.options.getString('footer', false);
      const pingroles = interaction.options.getBoolean('pingroles', false);

      let color = 0x57f287; // default
      if (colorRaw) {
        try {
          if (colorRaw.startsWith('#')) color = parseInt(colorRaw.replace('#',''), 16);
          else if (!isNaN(Number(colorRaw))) color = Number(colorRaw);
        } catch {}
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(color)
        .setTimestamp();

      if (footer) embed.setFooter({ text: footer });

      await interaction.reply({ content: pingroles && PING_ROLES.length ? PING_ROLES.map(id=>`<@&${id}>`).join(' ') : null, embeds: [embed] || undefined, ephemeral: false });
      return;
    }

    // --- AUDIT
    if (commandName === 'audit') {
      // permission check: можно расширить под роли (пока любой с правом ManageGuild или админ)
      const member = interaction.member;
      const canUse = member.permissions?.has(PermissionFlagsBits.ManageGuild) || member.permissions?.has(PermissionFlagsBits.ManageRoles) || member.permissions?.has(PermissionFlagsBits.Administrator);
      if (!canUse) {
        await interaction.reply({ content: 'У вас нет прав на использование /audit (требуется ManageGuild/ManageRoles).', ephemeral: true });
        return;
      }

      const target = interaction.options.getUser('target', true);
      const action = interaction.options.getString('action', true);
      const fromRank = interaction.options.getString('from_rank', false);
      const toRank = interaction.options.getString('to_rank', false);
      const reason = interaction.options.getString('reason', false);
      const note = interaction.options.getString('note', false);

      // increment summary
      const summ = ensureSummaryFor(target.id);
      if (action === 'promotion') summ.promotion++;
      else if (action === 'demotion') summ.demotion++;
      else if (action === 'warning') summ.warning++;
      else if (action === 'termination') summ.termination++;

      // prepare embed
      const actionReadable = {
        promotion: 'Promotion (Повышение)',
        demotion: 'Demotion (Понижение)',
        warning: 'Warning (Выговор)',
        termination: 'Termination (Увольнение)',
        other: 'Other (Другое)'
      }[action] || action;

      const embed = new EmbedBuilder()
        .setTitle('📝 Аудит — запись действия')
        .setColor(action === 'promotion' ? 0x57F287 : action === 'demotion' ? 0xED4245 : 0xFAA61A)
        .addFields(
          { name: 'Действие', value: actionReadable, inline: true },
          { name: 'Кто выполнил', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
          { name: 'На кого', value: `${target.tag} (<@${target.id}>)`, inline: true },
        )
        .setTimestamp();

      if (fromRank || toRank) {
        embed.addFields({ name: 'Ранги', value: `От: ${rankLabel(fromRank || '')}\nДо: ${rankLabel(toRank || '')}`, inline: false });
      }

      if (reason) embed.addFields({ name: 'Причина', value: reason, inline: false });
      if (note) embed.addFields({ name: 'Доп. заметки', value: note, inline: false });

      const summaryText = `📊 Текущая статистика (runtime):\n• Повышения: ${summ.promotion}\n• Понижения: ${summ.demotion}\n• Выговоры: ${summ.warning}\n• Увольнения: ${summ.termination}`;
      embed.addFields({ name: 'Статистика', value: summaryText, inline: false });

      // ping roles if set
      const ping = PING_ROLES.length ? PING_ROLES.map(id => `<@&${id}>`).join(' ') : '';

      // send to audit channel
      if (!AUDIT_CHANNEL_ID) {
        await interaction.reply({ content: 'Ошибка: AUDIT_CHANNEL_ID не задан в .env', ephemeral: true });
        return;
      }

      const ch = await client.channels.fetch(AUDIT_CHANNEL_ID).catch(()=>null);
      if (!ch) {
        await interaction.reply({ content: `Не удалось найти канал аудита с ID=${AUDIT_CHANNEL_ID}`, ephemeral: true });
        return;
      }

      await ch.send({ content: ping || null, embeds: [embed] });
      await interaction.reply({ content: 'Запись в аудит отправлена.', ephemeral: true });
      return;
    }

    // --- APPLY PANEL
    if (commandName === 'apply-panel') {
      // Only allow admins/mods
      const member = interaction.member;
      if (!(member.permissions?.has(PermissionFlagsBits.Administrator) || member.permissions?.has(PermissionFlagsBits.ManageGuild))) {
        await interaction.reply({ content: 'Только администратор/менеджер сервера может разместить панель заявок.', ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('✉️ Панель заявок Versize')
        .setDescription('Выберите нужный тип заявки ниже.')
        .setColor(0x5865F2);

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId('apply_submit').setLabel('Подать заявку в семью').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('apply_restore').setLabel('Восстановление').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('apply_unblack').setLabel('Снятие ЧС').setStyle(ButtonStyle.Secondary)
        );

      // send to channel (current)
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
      return;
    }

  } catch (err) {
    console.error('Ошибка при обработке команды:', err);
    if (interaction.replied || interaction.deferred) {
      try { await interaction.followUp({ content: 'Произошла ошибка при выполнении команды.', ephemeral: true }); } catch {}
    } else {
      try { await interaction.reply({ content: 'Произошла ошибка при выполнении команды.', ephemeral: true }); } catch {}
    }
  }
});

// --- Обработка нажатий кнопок панели заявок (простая реализация)
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isButton()) return;
    const id = interaction.customId;
    if (id === 'apply_submit' || id === 'apply_restore' || id === 'apply_unblack') {
      // Открыть модал или отправить формы — для простоты — ответим инструкцией
      const type = id === 'apply_submit' ? 'Заявка в семью' : id === 'apply_restore' ? 'Восстановление' : 'Снятие ЧС';
      await interaction.reply({ content: `Откройте Google Form или пришлите данные для: **${type}**. (Здесь можешь заменить на модал)`, ephemeral: true });
    }
  } catch (err) {
    console.error('Ошибка при обработке кнопки:', err);
  }
});

client.login(TOKEN).catch(err => {
  console.error('Не удалось залогиниться:', err);
});
