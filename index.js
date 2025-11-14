// index.js  (CommonJS)   — discord.js v14
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const APP_CHANNEL_ID = process.env.APP_CHANNEL_ID; // форум канал для заявок
const AUDIT_CHANNEL_ID = process.env.AUDIT_CHANNEL_ID;
const STAFF_ROLES = (process.env.STAFF_ROLES || '').split(',').map(s=>s.trim()).filter(Boolean);
const PING_ROLES = (process.env.PING_ROLES || '').split(',').map(s=>s.trim()).filter(Boolean);

if (!TOKEN) {
  console.error('DISCORD_TOKEN не задан в .env / Variables');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Регистрация команд (локально для GUILD_ID если задан)
  const commands = [
    {
      name: 'embed',
      description: 'Создать эмбэд (цвет, заголовок, текст, футер, картинка)',
      options: [
        { name: 'title', type: 3, description: 'Заголовок', required: false },
        { name: 'description', type: 3, description: 'Текст', required: false },
        { name: 'color', type: 3, description: 'Hex цвет, например #ff99cc', required: false },
        { name: 'footer', type: 3, description: 'Футер', required: false },
        { name: 'image', type: 3, description: 'URL картинки', required: false },
        { name: 'thumbnail', type: 3, description: 'URL миниатюры', required: false },
        { name: 'timestamp', type: 5, description: 'Добавить метку времени', required: false }
      ]
    },
    {
      name: 'audit',
      description: 'Записать запись в аудит (только для STAFF)',
      options: [
        { name: 'action', type: 3, description: 'Действие (принят/уволен/выговор/... )', required: true },
        { name: 'actor', type: 6, description: 'Кто совершил действие (тег)', required: true },
        { name: 'target', type: 6, description: 'Кто затронут (тег)', required: true },
        { name: 'reason', type: 3, description: 'Причина', required: false }
      ]
    },
    {
      name: 'apply-panel',
      description: 'Разместить панель заявок (кнопки) в текущем канале (или в bot channel).',
    }
  ];

  try {
    if (GUILD_ID) {
      await client.application.commands.set(commands, GUILD_ID);
      console.log('Commands registered for guild', GUILD_ID);
    } else {
      await client.application.commands.set(commands);
      console.log('Commands registered globally (may take up to 1 hour)');
    }
  } catch (err) {
    console.error('Ошибка регистрации команд:', err);
  }
});

// Вспомогательная: проверка прав STAFF
function isStaff(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.Administrator) || member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  for (const r of STAFF_ROLES) {
    if (!r) continue;
    if (member.roles?.cache?.has(r)) return true;
  }
  return false;
}

// Утилита: собрать content с пингом ролей
function buildRolePingContent() {
  if (!PING_ROLES.length) return '';
  return PING_ROLES.map(id => `<@&${id}>`).join(' ') + ' ';
}

// === Обработчик интеракций (команды + кнопки + модалки) ===
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // --- Slash commands ---
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      // /embed
      if (cmd === 'embed') {
        const title = interaction.options.getString('title');
        const desc = interaction.options.getString('description');
        const colorIn = interaction.options.getString('color');
        const footer = interaction.options.getString('footer');
        const image = interaction.options.getString('image');
        const thumb = interaction.options.getString('thumbnail');
        const ts = interaction.options.getBoolean('timestamp');

        const embed = new EmbedBuilder();
        if (title) embed.setTitle(title);
        if (desc) embed.setDescription(desc);
        if (colorIn) {
          const hex = colorIn.replace('#','').trim();
          if (/^[0-9A-Fa-f]{6}$/.test(hex)) embed.setColor(parseInt(hex, 16));
          else embed.setColor(null);
        }
        if (footer) embed.setFooter({ text: footer });
        if (image) embed.setImage(image);
        if (thumb) embed.setThumbnail(thumb);
        if (ts) embed.setTimestamp(new Date());

        await interaction.reply({ embeds: [embed] });
        return;
      }

      // /audit
      if (cmd === 'audit') {
        const member = interaction.member;
        if (!isStaff(member)) {
          await interaction.reply({ content: 'У вас нет прав для записи в аудит.', ephemeral: true });
          return;
        }
        const action = interaction.options.getString('action');
        const actor = interaction.options.getUser('actor');
        const target = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'Не указана';

        const embed = new EmbedBuilder()
          .setTitle('📘 Аудит')
          .setColor(0x5865F2)
          .addFields(
            { name: 'Действие', value: action, inline: true },
            { name: 'Кто выполнил', value: `${actor.tag} (${actor.id})`, inline: true },
            { name: 'Кого коснулось', value: `${target.tag} (${target.id})`, inline: true },
            { name: 'Причина', value: reason, inline: false },
            { name: 'Записал', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false }
          )
          .setTimestamp(new Date());

        let postChannel = null;
        if (AUDIT_CHANNEL_ID) {
          try {
            postChannel = await client.channels.fetch(AUDIT_CHANNEL_ID);
          } catch (e) {
            console.warn('AUDIT_CHANNEL_ID fetch error', e);
            postChannel = null;
          }
        }
        if (!postChannel) postChannel = interaction.channel;

        await postChannel.send({ embeds: [embed] }).catch(console.error);
        await interaction.reply({ content: 'Аудит записан.', ephemeral: true });
        return;
      }

      // /apply-panel — вывод панели кнопок
      if (cmd === 'apply-panel') {
        // Создаём embed + кнопки
        const embed = new EmbedBuilder()
          .setTitle('✉️ Панель заявок Versize')
          .setDescription('Выберите нужный тип заявки ниже.')
          .setColor(0x8BE4FF);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_apply_modal_apply').setLabel('Подать заявку в семью').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('open_apply_modal_restore').setLabel('Восстановление').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('open_apply_modal_remove_black').setLabel('Снятие ЧС').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }
    }

    // --- Button click: открываем модальное окно для подачи (тип задан в customId) ---
    if (interaction.isButton()) {
      const cid = interaction.customId; // e.g. open_apply_modal_apply
      if (cid && cid.startsWith('open_apply_modal_')) {
        const type = cid.replace('open_apply_modal_', '') || 'apply';

        const modal = new ModalBuilder()
          .setCustomId('apply_modal_' + type)
          .setTitle(type === 'apply' ? 'Заявка в семью' : (type === 'restore' ? 'Заявка на восстановление' : 'Снятие ЧС'));

        // Поля — как просил: вопросы которые пользователь заполнит
        const q1 = new TextInputBuilder().setCustomId('q_name').setLabel('Ваше имя (OOC)').setStyle(TextInputStyle.Short).setRequired(true);
        const q2 = new TextInputBuilder().setCustomId('q_age').setLabel('Ваш возраст').setStyle(TextInputStyle.Short).setRequired(true);
        const q3 = new TextInputBuilder().setCustomId('q_discord').setLabel('Ваш дискорд для связи').setStyle(TextInputStyle.Short).setRequired(true);
        const q4 = new TextInputBuilder().setCustomId('q_ic').setLabel('Ваше имя, фамилия, #статик (IC)').setStyle(TextInputStyle.Short).setRequired(true);
        const q5 = new TextInputBuilder().setCustomId('q_history').setLabel('В каких семьях состояли, опишите подробно').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const q6 = new TextInputBuilder().setCustomId('q_why').setLabel('Почему именно мы?').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const q7 = new TextInputBuilder().setCustomId('q_how').setLabel('Откуда про нас узнали?').setStyle(TextInputStyle.Short).setRequired(false);

        // Для модалей в discord.js v14 нужно добавлять Input в ActionRow
        const rows = [
          new ActionRowBuilder().addComponents(q1),
          new ActionRowBuilder().addComponents(q2),
          new ActionRowBuilder().addComponents(q3),
          new ActionRowBuilder().addComponents(q4),
          new ActionRowBuilder().addComponents(q5),
          new ActionRowBuilder().addComponents(q6),
          new ActionRowBuilder().addComponents(q7)
        ];
        modal.addComponents(...rows);

        await interaction.showModal(modal);
        return;
      }

      // Кнопки принятия/отклонения внутри отправленной заявки
      // customId формата: action_accept_userid или action_deny_userid или edit_userid
      if (['accept','deny','edit'].some(k => interaction.customId.startsWith(k + '_'))) {
        const member = interaction.member;
        if (!isStaff(member)) {
          await interaction.reply({ content: 'У вас нет прав на управление заявками.', ephemeral: true });
          return;
        }

        const parts = interaction.customId.split('_'); // [action, userId]
        const action = parts[0];
        const userId = parts.slice(1).join('_');

        // Получаем оригинальный embed (первый)
        const originalEmbed = interaction.message.embeds?.[0] ? EmbedBuilder.from(interaction.message.embeds[0]) : null;
        if (action === 'accept') {
          if (originalEmbed) {
            originalEmbed.setColor(0x57F287);
            originalEmbed.addFields({ name: '📌 Статус', value: `Принят ${interaction.user.tag}`, inline: false });
          }
          await interaction.message.edit({ embeds: originalEmbed ? [originalEmbed] : [], components: [] }).catch(()=>{});
          const thread = interaction.message.thread ?? await interaction.message.startThread({ name: `Решение — ${userId}` }).catch(()=>null);
          if (thread) await thread.send(`Заявка принята пользователем ${interaction.user} (${interaction.user.tag}).`).catch(()=>{});
          await interaction.reply({ content: 'Вы приняли заявку.', ephemeral: true });
          return;
        }
        if (action === 'deny') {
          if (originalEmbed) {
            originalEmbed.setColor(0xED4245);
            originalEmbed.addFields({ name: '📌 Статус', value: `Отклонено ${interaction.user.tag}`, inline: false });
          }
          await interaction.message.edit({ embeds: originalEmbed ? [originalEmbed] : [], components: [] }).catch(()=>{});
          const thread = interaction.message.thread ?? await interaction.message.startThread({ name: `Решение — ${userId}` }).catch(()=>null);
          if (thread) await thread.send(`Заявка отклонена пользователем ${interaction.user} (${interaction.user.tag}).`).catch(()=>{});
          await interaction.reply({ content: 'Вы отклонили заявку.', ephemeral: true });
          return;
        }
        if (action === 'edit') {
          if (originalEmbed) {
            originalEmbed.setColor(0xFAA61A);
            originalEmbed.addFields({ name: '📌 Статус', value: `Запрошены правки модерацией ${interaction.user.tag}`, inline: false });
          }
          await interaction.message.edit({ embeds: originalEmbed ? [originalEmbed] : [] }).catch(()=>{});
          const thread = interaction.message.thread ?? await interaction.message.startThread({ name: `Решение — ${userId}` }).catch(()=>null);
          if (thread) await thread.send(`${interaction.user} запросил(а) правки у заявителя. Пожалуйста, ответьте в треде.`).catch(()=>{});
          await interaction.reply({ content: 'Запрошены правки.', ephemeral: true });
          return;
        }
      }
    }

    // --- Modal Submit: обработка отправки формы ---
    if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith('apply_modal_')) return;
      await interaction.deferReply({ ephemeral: true });

      const type = interaction.customId.replace('apply_modal_', '') || 'apply';

      // Собираем ответы
      const name = interaction.fields.getTextInputValue('q_name') || '-';
      const age = interaction.fields.getTextInputValue('q_age') || '-';
      const discord = interaction.fields.getTextInputValue('q_discord') || '-';
      const ic = interaction.fields.getTextInputValue('q_ic') || '-';
      const history = interaction.fields.getTextInputValue('q_history') || '-';
      const why = interaction.fields.getTextInputValue('q_why') || '-';
      const how = interaction.fields.getTextInputValue('q_how') || '-';

      // Формируем embed: сначала вопросы — затем ответы (каждое поле: вопрос и ответ)
      const outEmbed = new EmbedBuilder()
        .setTitle(type === 'apply' ? '📩 Новая заявка' : (type === 'restore' ? '🔁 Заявка на восстановление' : '🚫 Снятие ЧС'))
        .setColor(0x8BE4FF)
        .addFields(
          { name: 'OOC.- Ваше имя', value: `**${name}**`, inline: false },
          { name: 'OOC.- Ваш возраст', value: `**${age}**`, inline: false },
          { name: 'OOC.- Ваш дискорд для связи', value: `**${discord}**`, inline: false },
          { name: 'IC.- Ваше Имя, Фамилия, #статик', value: `**${ic}**`, inline: false },
          { name: 'IC.- В каких семьях состояли, опишите подробно', value: `**${history}**`, inline: false },
          { name: 'IC.- Почему именно мы?', value: `**${why}**`, inline: false },
          { name: 'Откуда про нас узнали?', value: `**${how}**`, inline: false }
        )
        .setFooter({ text: `Заявка от ${interaction.user.tag}` })
        .setTimestamp(new Date());

      // content с упоминанием ролей
      const rolePing = buildRolePingContent();

      // Добавляем кнопки (accept/deny/edit) с customId содержащим id заявителя
      const applicantId = interaction.user.id;
      const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`accept_${applicantId}`).setLabel('Принять').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`deny_${applicantId}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`edit_${applicantId}`).setLabel('Запросить правки').setStyle(ButtonStyle.Secondary)
      );

      // Отправляем в форум канал (APP_CHANNEL_ID)
      let channel = null;
      if (APP_CHANNEL_ID) {
        try {
          channel = await client.channels.fetch(APP_CHANNEL_ID);
        } catch (e) {
          console.error('Ошибка fetch APP_CHANNEL_ID', e);
          channel = null;
        }
      }
      if (!channel) {
        // fallback — отправить туда, где вызвали
        channel = interaction.channel;
      }

      // Отправка — в форуме отправка обычного сообщения создаёт публикацию
      const sent = await channel.send({ content: `${rolePing}Новая заявка от ${interaction.user} — тип: **${type}**`, embeds: [outEmbed], components: [btnRow] }).catch(e => {
        console.error('Ошибка отправки заявки в канал:', e);
        return null;
      });

      if (!sent) {
        await interaction.editReply({ content: 'Не удалось отправить заявку в канал. Свяжитесь с администратором.' });
        return;
      }

      await interaction.editReply({ content: 'Заявка отправлена. Спасибо!' });
      return;
    }

  } catch (err) {
    console.error('Ошибка в обработчике интеракций:', err);
    try { if (interaction && !interaction.replied) await interaction.reply({ content: 'Ошибка обработки. Администратор уведомлён.', ephemeral: true }); } catch {}
  }
});

// Логин
client.login(TOKEN).catch(err => {
  console.error('Не удалось залогиниться — проверь DISCORD_TOKEN', err);
});
