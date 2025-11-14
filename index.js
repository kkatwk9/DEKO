// index.js (CommonJS) — для discord.js v14+
// Убедись, что package.json НЕ содержит "type":"module"
require('dotenv').config();

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const AUDIT_CHANNEL_ID = process.env.AUDIT_CHANNEL_ID;
const APP_CHANNEL_ID = process.env.APP_CHANNEL_ID;
const PING_ROLES = (process.env.PING_ROLES || '').split(',').filter(Boolean);

if (!TOKEN || !CLIENT_ID) {
  console.error('Нужно задать DISCORD_TOKEN и CLIENT_ID в .env');
  process.exit(1);
}

// ----- Команды -----
const commandsPayload = [
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Создать эмбэд (заголовок, текст, цвет, футер)')
    .addStringOption(opt => opt.setName('title').setDescription('Заголовок').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Описание').setRequired(true))
    .addStringOption(opt => opt.setName('color').setDescription('HEX цвет, напр. #ff66aa').setRequired(false))
    .addStringOption(opt => opt.setName('footer').setDescription('Футер').setRequired(false))
    .addBooleanOption(opt => opt.setName('pingroles').setDescription('Пинговать роли из env?').setRequired(false))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Добавить запись в аудит (promotion/demotion/warning/termination)')
    .addUserOption(o => o.setName('target').setDescription('Кому действие').setRequired(true))
    .addStringOption(o => o.setName('action').setDescription('Действие').setRequired(true)
      .addChoices(
        { name: 'Promotion', value: 'promotion' },
        { name: 'Demotion', value: 'demotion' },
        { name: 'Warning', value: 'warning' },
        { name: 'Termination', value: 'termination' },
        { name: 'Other', value: 'other' },
      ))
    .addStringOption(o => o.setName('from_rank').setDescription('От ранга').setRequired(false)
      .addChoices(
        { name:'8 — Generalisimus', value:'8'},{ name:'7 — Vice Gen.', value:'7'},
        { name:'6 — Gen. Secretary', value:'6'},{ name:'5 — Curator', value:'5'},
        { name:"4 — Curator's Office", value:'4'},{ name:'3 — Stacked', value:'3'},
        { name:'2 — Main', value:'2'},{ name:'1 — NewBie', value:'1'}
      ))
    .addStringOption(o => o.setName('to_rank').setDescription('До ранга').setRequired(false)
      .addChoices(
        { name:'8 — Generalisimus', value:'8'},{ name:'7 — Vice Gen.', value:'7'},
        { name:'6 — Gen. Secretary', value:'6'},{ name:'5 — Curator', value:'5'},
        { name:"4 — Curator's Office", value:'4'},{ name:'3 — Stacked', value:'3'},
        { name:'2 — Main', value:'2'},{ name:'1 — NewBie', value:'1'}
      ))
    .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(false))
    .addStringOption(o => o.setName('note').setDescription('Заметки').setRequired(false))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('apply-panel')
    .setDescription('Разместить панель заявок (только для админов/менеджеров)')
    .toJSON()
];

// Регистрация команд
(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commandsPayload });
      console.log('Slash-команды зарегистрированы в гильдии', GUILD_ID);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commandsPayload });
      console.log('Slash-команды зарегистрированы глобально (до 1 часа)');
    }
  } catch (e) {
    console.error('Ошибка регистрации команд:', e);
  }
})();

// ----- Клиент -----
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log('Logged in as', client.user.tag);
});

// ----- In-memory audit summary -----
const auditSummary = new Map();
function ensureSummary(id){ if(!auditSummary.has(id)) auditSummary.set(id, { promotion:0, demotion:0, warning:0, termination:0 }); return auditSummary.get(id); }
function rankLabel(v){
  return { '8':'8 — Generalisimus','7':'7 — Vice Gen.','6':'6 — Gen. Secretary','5':'5 — Curator','4':"4 — Curator's Office",'3':'3 — Stacked','2':'2 — Main','1':'1 — NewBie' }[v]||'—';
}

// ----- Обработка команд -----
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      // ---- EMBED ----
      if (name === 'embed') {
        const title = interaction.options.getString('title', true);
        const desc = interaction.options.getString('description', true);
        const colorOpt = interaction.options.getString('color', false);
        const footer = interaction.options.getString('footer', false);
        const pingroles = interaction.options.getBoolean('pingroles', false);

        let color = 0x57f287;
        if (colorOpt) {
          try {
            if (colorOpt.startsWith('#')) color = parseInt(colorOpt.slice(1), 16);
            else if (!isNaN(Number(colorOpt))) color = Number(colorOpt);
          } catch {}
        }

        const emb = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
        if (footer) emb.setFooter({ text: footer });

        await interaction.reply({ content: (pingroles && PING_ROLES.length) ? PING_ROLES.map(id=>`<@&${id}>`).join(' ') : null, embeds: [emb], ephemeral: false });
        return;
      }

      // ---- AUDIT ----
      if (name === 'audit') {
        // проверка прав: ManageGuild/ManageRoles/Admin
        const mem = interaction.member;
        if (!mem.permissions?.has(PermissionFlagsBits.ManageGuild) && !mem.permissions?.has(PermissionFlagsBits.ManageRoles) && !mem.permissions?.has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({ content: 'У вас нет прав для /audit (требуется ManageGuild/ManageRoles/Administrator).', ephemeral: true });
          return;
        }

        const target = interaction.options.getUser('target', true);
        const action = interaction.options.getString('action', true);
        const fromRank = interaction.options.getString('from_rank', false);
        const toRank = interaction.options.getString('to_rank', false);
        const reason = interaction.options.getString('reason', false);
        const note = interaction.options.getString('note', false);

        const summ = ensureSummary(target.id);
        if (action === 'promotion') summ.promotion++;
        if (action === 'demotion') summ.demotion++;
        if (action === 'warning') summ.warning++;
        if (action === 'termination') summ.termination++;

        const actionMap = { promotion:'Promotion (Повышение)', demotion:'Demotion (Понижение)', warning:'Warning (Выговор)', termination:'Termination (Увольнение)', other:'Other' };
        const emb = new EmbedBuilder()
          .setTitle('📝 Аудит — запись')
          .setColor(action === 'promotion' ? 0x57F287 : action === 'demotion' ? 0xED4245 : 0xFAA61A)
          .addFields(
            { name: 'Действие', value: actionMap[action]||action, inline: true },
            { name: 'Кто', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
            { name: 'Кому', value: `${target.tag} (<@${target.id}>)`, inline: true },
          )
          .setTimestamp();

        if (fromRank || toRank) emb.addFields({ name: 'Ранги', value: `От: ${rankLabel(fromRank)}\nДо: ${rankLabel(toRank)}`, inline: false });
        if (reason) emb.addFields({ name: 'Причина', value: reason, inline: false });
        if (note) emb.addFields({ name: 'Заметки', value: note, inline: false });

        emb.addFields({ name: 'Статистика (runtime)', value: `📊 Повышения: ${summ.promotion}\n📊 Понижения: ${summ.demotion}\n📊 Выговоры: ${summ.warning}\n📊 Увольнения: ${summ.termination}`, inline: false });

        if (!AUDIT_CHANNEL_ID) {
          await interaction.reply({ content: 'Ошибка: AUDIT_CHANNEL_ID не задан', ephemeral: true }); return;
        }
        const ch = await client.channels.fetch(AUDIT_CHANNEL_ID).catch(()=>null);
        if (!ch) { await interaction.reply({ content: `Не найден канал аудита ID=${AUDIT_CHANNEL_ID}`, ephemeral: true }); return; }

        await ch.send({ embeds: [emb] });
        await interaction.reply({ content: 'Запись отправлена в аудит.', ephemeral: true });
        return;
      }

      // ---- APPLY PANEL ----
      if (name === 'apply-panel') {
        const mem = interaction.member;
        if (!mem.permissions?.has(PermissionFlagsBits.Administrator) && !mem.permissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({ content: 'Только админ/менеджер может разместить панель заявок.', ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('✉️ Панель заявок Versize')
          .setDescription('Выберите нужный тип заявки ниже.')
          .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('apply_submit').setLabel('Подать заявку в семью').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('apply_restore').setLabel('Восстановление').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('apply_unblack').setLabel('Снятие ЧС').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
        return;
      }
    }

    // ---- Обработка нажатий кнопок ----
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Кнопки панели: открыть модальное окно соответствующее
      if (id === 'apply_submit' || id === 'apply_restore' || id === 'apply_unblack') {
        // модальное окно
        const modal = new ModalBuilder()
          .setCustomId(`modal_${id}_${interaction.user.id}`)
          .setTitle(id === 'apply_submit' ? 'Заявка в семью' : id === 'apply_restore' ? 'Восстановление' : 'Снятие ЧС');

        // общие поля
        const nick = new TextInputBuilder().setCustomId('nick').setLabel('Ник | статик').setStyle(TextInputStyle.Short).setRequired(true);
        const server = new TextInputBuilder().setCustomId('server').setLabel('Сервер').setStyle(TextInputStyle.Short).setRequired(true);
        const age = new TextInputBuilder().setCustomId('age').setLabel('Имя и возраст').setStyle(TextInputStyle.Short).setRequired(true);
        const about = new TextInputBuilder().setCustomId('about').setLabel('О себе (кратко)').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const motiv = new TextInputBuilder().setCustomId('motivation').setLabel('Мотивация / ожидания').setStyle(TextInputStyle.Paragraph).setRequired(true);

        // добавляем по две строчки в modal (ActionRow не нужен — используем модальные поля в порядке)
        modal.addComponents(
          new ActionRowBuilder().addComponents(nick),
          new ActionRowBuilder().addComponents(server),
          new ActionRowBuilder().addComponents(age),
          new ActionRowBuilder().addComponents(about),
          new ActionRowBuilder().addComponents(motiv),
        );

        await interaction.showModal(modal);
        return;
      }

      // Кнопки приложения в сообщении-заявке: принят/отклонить/редактировать
      if (id.startsWith('app_accept_') || id.startsWith('app_deny_') || id.startsWith('app_edit_')) {
        // формат customId: app_accept_<messageId> или app_accept_<userId> — у нас используем messageId
        // но безопаснее: получаем оригинальное сообщение через interaction.message
        const isAllowed = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isAllowed) {
          await interaction.reply({ content: 'У вас нет прав для этого.', ephemeral: true });
          return;
        }

        const originalEmbed = interaction.message.embeds?.[0] ? EmbedBuilder.from(interaction.message.embeds[0]) : null;
        const actor = interaction.user;

        if (id.startsWith('app_accept_')) {
          if (originalEmbed) originalEmbed.setColor(0x57F287).addFields({ name: '📌 Статус', value: `Принят: ${actor.tag}`, inline: false });
          await interaction.message.edit({ embeds: originalEmbed ? [originalEmbed] : [], components: [] }).catch(()=>{});
          const thread = interaction.message.thread ?? await interaction.message.startThread({ name: `Решение — ${actor.username}`, autoArchiveDuration: 10080 }).catch(()=>null);
          if (thread) await thread.send(`Заявка принята ${actor} (${actor.tag})`).catch(()=>{});
          // отправим лог в аудит
          if (AUDIT_CHANNEL_ID) {
            const ch = await client.channels.fetch(AUDIT_CHANNEL_ID).catch(()=>null);
            if (ch) {
              const emb = new EmbedBuilder()
                .setTitle('✅ Заявка принята')
                .setDescription(`Пользователь: ${actor.tag}\nСообщение: ${interaction.id}`)
                .setColor(0x57F287)
                .setTimestamp();
              await ch.send({ embeds: [emb] }).catch(()=>{});
            }
          }
          await interaction.reply({ content: 'Вы приняли заявку.', ephemeral: true });
          return;
        }

        if (id.startsWith('app_deny_')) {
          if (originalEmbed) originalEmbed.setColor(0xED4245).addFields({ name: '📌 Статус', value: `Отклонено: ${actor.tag}`, inline: false });
          await interaction.message.edit({ embeds: originalEmbed ? [originalEmbed] : [], components: [] }).catch(()=>{});
          const thread = interaction.message.thread ?? await interaction.message.startThread({ name: `Решение — ${actor.username}`, autoArchiveDuration: 10080 }).catch(()=>null);
          if (thread) await thread.send(`Заявка отклонена ${actor} (${actor.tag})`).catch(()=>{});
          if (AUDIT_CHANNEL_ID) {
            const ch = await client.channels.fetch(AUDIT_CHANNEL_ID).catch(()=>null);
            if (ch) {
              const emb = new EmbedBuilder()
                .setTitle('❌ Заявка отклонена')
                .setDescription(`Пользователь: ${actor.tag}\nСообщение: ${interaction.id}`)
                .setColor(0xED4245)
                .setTimestamp();
              await ch.send({ embeds: [emb] }).catch(()=>{});
            }
          }
          await interaction.reply({ content: 'Вы отклонили заявку.', ephemeral: true });
          return;
        }

        if (id.startsWith('app_edit_')) {
          if (originalEmbed) originalEmbed.setColor(0xFAA61A).addFields({ name: '📌 Статус', value: `Запрошены правки: ${actor.tag}`, inline: false });
          await interaction.message.edit({ embeds: originalEmbed ? [originalEmbed] : [] }).catch(()=>{});
          const thread = interaction.message.thread ?? await interaction.message.startThread({ name: `Решение — ${actor.username}`, autoArchiveDuration: 10080 }).catch(()=>null);
          if (thread) await thread.send(`${actor} запросил(а) правки у заявителя.`).catch(()=>{});
          if (AUDIT_CHANNEL_ID) {
            const ch = await client.channels.fetch(AUDIT_CHANNEL_ID).catch(()=>null);
            if (ch) {
              const emb = new EmbedBuilder()
                .setTitle('✏️ Запрошены правки')
                .setDescription(`Пользователь: ${actor.tag}\nСообщение: ${interaction.id}`)
                .setColor(0xFAA61A)
                .setTimestamp();
              await ch.send({ embeds: [emb] }).catch(()=>{});
            }
          }
          await interaction.reply({ content: 'Запрошены правки.', ephemeral: true });
          return;
        }
      }
    }

    // ---- Обработка отправленных модалов ----
    if (interaction.isModalSubmit()) {
      // customId = modal_apply_submit_<userId> или similar
      const cid = interaction.customId || '';
      if (cid.startsWith('modal_modal_') || cid.startsWith('modal_apply_submit_') || cid.includes('apply')) {
        // получаем поля
        const nick = interaction.fields.getTextInputValue('nick');
        const server = interaction.fields.getTextInputValue('server');
        const age = interaction.fields.getTextInputValue('age');
        const about = interaction.fields.getTextInputValue('about');
        const motivation = interaction.fields.getTextInputValue('motivation');

        // формируем embed
        const emb = new EmbedBuilder()
          .setTitle('📝 Заявка на вступление')
          .setDescription(`Заявитель: ${interaction.user} (${interaction.user.tag})`)
          .addFields(
            { name: 'Ник | Статик', value: nick || '-', inline: false },
            { name: 'Сервер', value: server || '-', inline: true },
            { name: 'Имя и возраст', value: age || '-', inline: true },
            { name: 'О себе', value: about || '-', inline: false },
            { name: 'Мотивация', value: motivation || '-', inline: false },
          )
          .setColor(0x6A5ACD)
          .setTimestamp();

        // TODO: если нужно добавить gradient / красивости — нельзя прямо в embed, ограничены discord API

        // компоненты: кнопки принят/отклонить/правки
        const btns = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`app_accept_${Date.now()}`).setLabel('Принять').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`app_edit_${Date.now()}`).setLabel('Запросить правки').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`app_deny_${Date.now()}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger),
        );

        // отправляем в канал заявок
        if (!APP_CHANNEL_ID) {
          await interaction.reply({ content: 'Ошибка: APP_CHANNEL_ID не задан в .env', ephemeral: true });
          return;
        }
        const ch = await client.channels.fetch(APP_CHANNEL_ID).catch(()=>null);
        if (!ch) {
          await interaction.reply({ content: `Не найден канал заявок ID=${APP_CHANNEL_ID}`, ephemeral: true });
          return;
        }

        // упоминание ролей
        const ping = PING_ROLES.length ? PING_ROLES.map(id=>`<@&${id}>`).join(' ') : null;

        // отправка
        const sent = await ch.send({ content: ping || null, embeds: [emb], components: [btns] }).catch(async (err) => {
          console.error('Ошибка отправки заявки в канал:', err);
          await interaction.reply({ content: 'Ошибка при отправке заявки (см. логи).', ephemeral: true });
          return null;
        });

        if (!sent) return;
        // если канал — форум, сообщение будет опубликовано как пост; бот также может стартовать тред (по желанию)
        await interaction.reply({ content: 'Заявка успешно отправлена.', ephemeral: true });
        return;
      }
    }

  } catch (err) {
    console.error('Ошибка взаимодействия:', err);
    try { if (!interaction.replied) await interaction.reply({ content: 'Произошла ошибка, админ уведомлён.', ephemeral: true }); } catch {}
  }
});

// ----- Логин -----
client.login(TOKEN).catch(err => {
  console.error('Не удалось залогиниться:', err);
});
