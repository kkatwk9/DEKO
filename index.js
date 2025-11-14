// index.js (ESM)
// Требует: discord.js v14, @discordjs/rest, discord-api-types, dotenv
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Events, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ChannelType } from 'discord.js';
import { REST as RESTv } from '@discordjs/rest';
import { Routes as API_Routes } from 'discord-api-types/v10';

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  APP_CHANNEL_ID,
  ROLE_IDS,
  AUDIT_CHANNEL_ID
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Убедитесь, что DISCORD_TOKEN и CLIENT_ID заданы в .env');
  process.exit(1);
}

// helper: parse role ids
const ROLE_IDS_ARRAY = (ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// создаём клиента
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

// --- ОПРЕДЕЛЕНИЕ СЛЕШ-КОМАНД ---
const commands = [
  new SlashCommandBuilder()
    .setName('apply-panel')
    .setDescription('Опубликовать панель заявок (кнопки)'),
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Создать эмбэд (Title/Description/Color)')
    .addStringOption(opt => opt.setName('title').setDescription('Заголовок').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Текст').setRequired(true))
    .addStringOption(opt => opt.setName('color').setDescription('Цвет в hex, например #ff66aa').setRequired(false)),
  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Логировать действие (повышение/понижение/выговор/увольнение и т.д.)')
    .addUserOption(o => o.setName('author').setDescription('Кто совершил действие').setRequired(true))
    .addUserOption(o => o.setName('target').setDescription('Кого это касается').setRequired(true))
    .addStringOption(o => o.setName('action').setDescription('Действие').setRequired(true)
      .addChoices(
        { name: 'Повышение', value: 'promote' },
        { name: 'Понижение', value: 'demote' },
        { name: 'Выговор', value: 'warn' },
        { name: 'Увольнение', value: 'fire' },
        { name: 'Выдача ранга', value: 'give_rank' }
      ))
    .addStringOption(o => o.setName('reason').setDescription('Причина/подробности').setRequired(false))
    // выбор с/на ранга
    .addStringOption(o => o.setName('from_rank').setDescription('С какого ранга (если применимо)').setRequired(false)
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
    .addStringOption(o => o.setName('to_rank').setDescription('На какой ранг (если применимо)').setRequired(false)
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
].map(cmd => cmd.toJSON());

// регистрируем команды (guild если указан GUILD_ID, иначе глобально)
(async () => {
  try {
    const rest = new RESTv({ version: '10' }).setToken(DISCORD_TOKEN);
    if (GUILD_ID) {
      console.log('Регистрация слэш-команд в гильдии', GUILD_ID);
      await rest.put(API_Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    } else {
      console.log('Регистрация глобальных слэш-команд (может занять до часа)');
      await rest.put(API_Routes.applicationCommands(CLIENT_ID), { body: commands });
    }
    console.log('Слэш-команды зарегистрированы.');
  } catch (err) {
    console.error('Ошибка регистрации слэш-команд:', err);
  }
})();

// ------- HANDLERS -------
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // --- СЛЕШ-КОМАНДЫ ---
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'apply-panel') {
        // только для модераторов: проверка прав (можешь убрать)
        if (!interaction.memberPermissions?.has?.('ManageGuild')) {
          // если не хотите проверку, закомментируйте строку выше и нижнюю ветку
          await interaction.reply({ content: 'У вас нет прав на публикацию панели.', ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('✉️ Панель заявок Versize')
          .setDescription('Выберите нужный тип заявки ниже.')
          .setColor(0x8e44ad);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('apply_family').setLabel('Подать заявку в семью').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('apply_restore').setLabel('Восстановление').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('apply_unblack').setLabel('Снятие ЧС').setStyle(ButtonStyle.Secondary),
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }

      if (interaction.commandName === 'embed') {
        const title = interaction.options.getString('title', true);
        const description = interaction.options.getString('description', true);
        const color = interaction.options.getString('color') || '#7ad7f0';

        const e = new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(color);

        await interaction.reply({ embeds: [e] });
        return;
      }

      if (interaction.commandName === 'audit') {
        // собираем опции
        const actor = interaction.options.getUser('author', true);
        const target = interaction.options.getUser('target', true);
        const action = interaction.options.getString('action', true);
        const reason = interaction.options.getString('reason') || '—';
        const fromRank = interaction.options.getString('from_rank') || '—';
        const toRank = interaction.options.getString('to_rank') || '—';

        const mapAction = {
          promote: 'Повышение',
          demote: 'Понижение',
          warn: 'Выговор',
          fire: 'Увольнение',
          give_rank: 'Выдача ранга'
        };

        const embed = new EmbedBuilder()
          .setTitle('📝 Аудит — запись действия')
          .addFields(
            { name: 'Действие', value: mapAction[action] || action, inline: true },
            { name: 'Кто', value: `<@${actor.id}>`, inline: true },
            { name: 'Кого', value: `<@${target.id}>`, inline: true },
            { name: 'Из ранга', value: fromRank === '—' ? '—' : `${fromRank}`, inline: true },
            { name: 'В ранг', value: toRank === '—' ? '—' : `${toRank}`, inline: true },
            { name: 'Причина', value: reason, inline: false },
          )
          .setTimestamp()
          .setColor(0xf1c40f);

        // отправляем в канал аудита
        if (!AUDIT_CHANNEL_ID) {
          await interaction.reply({ content: 'Ошибка: AUDIT_CHANNEL_ID не задан в .env', ephemeral: true });
          return;
        }

        const ch = await client.channels.fetch(AUDIT_CHANNEL_ID).catch(() => null);
        if (!ch || !ch.isTextBased()) {
          await interaction.reply({ content: 'Не удалось найти текстовый канал аудита или нет доступа.', ephemeral: true });
          return;
        }

        await ch.send({ embeds: [embed] }).catch(()=>{});
        await interaction.reply({ content: 'Запись аудита отправлена.', ephemeral: true });
        return;
      }
    }

    // --- КНОПКИ / МОДАЛЫ ---
    if (interaction.isButton()) {
      // кнопки панели заявок
      if (interaction.customId.startsWith('apply_')) {
        // show modal
        const type = interaction.customId.split('_')[1]; // family / restore / unblack
        const modal = new ModalBuilder()
          .setCustomId(`apply_modal_${type}`)
          .setTitle(type === 'family' ? 'Заявка в семью' : type === 'restore' ? 'Восстановление' : 'Снятие ЧС');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('your_name')
              .setLabel('Ваше имя')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('age')
              .setLabel('Ваш возраст')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('discord_tag')
              .setLabel('Ваш Discord для связи')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ic_name')
              .setLabel('IC - Имя, Фамилия, #статик')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('history')
              .setLabel('В каких семьях состояли, опишите подробно')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('motivation')
              .setLabel('Почему именно мы?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
        );

        await interaction.showModal(modal);
        return;
      }
    }

    // --- MODAL SUBMIT ---
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('apply_modal_')) {
        const type = interaction.customId.split('_')[2];
        // собираем ответы
        const yourName = interaction.fields.getTextInputValue('your_name');
        const age = interaction.fields.getTextInputValue('age');
        const discordTag = interaction.fields.getTextInputValue('discord_tag');
        const ic = interaction.fields.getTextInputValue('ic_name');
        const history = interaction.fields.getTextInputValue('history');
        const motivation = interaction.fields.getTextInputValue('motivation');

        const embed = new EmbedBuilder()
          .setTitle(`📩 Новая заявка — ${type === 'family' ? 'Вступление' : type === 'restore' ? 'Восстановление' : 'Снятие ЧС'}`)
          .setColor(0x7b68ee)
          .addFields(
            { name: 'OOC - Ваше имя', value: yourName || '—' },
            { name: 'OOC - Ваш возраст', value: age || '—' },
            { name: 'OOC - Ваш дискорд для связи', value: discordTag || '—' },
            { name: 'IC - Ваше Имя, Фамилия, #статик', value: ic || '—' },
            { name: 'IC - В каких семьях состояли', value: history || '—' },
            { name: 'IC - Почему именно мы?', value: motivation || '—' },
          )
          .setFooter({ text: 'Секретарь Deko — заявка из формы' })
          .setTimestamp();

        if (!APP_CHANNEL_ID) {
          await interaction.reply({ content: 'Ошибка: APP_CHANNEL_ID не задан в .env', ephemeral: true });
          return;
        }

        const ch = await client.channels.fetch(APP_CHANNEL_ID).catch(()=>null);
        if (!ch || !ch.isTextBased()) {
          await interaction.reply({ content: 'Не удалось найти канал для заявок или бот не имеет доступа.', ephemeral: true });
          return;
        }

        // формируем упоминание ролей (если заданы)
        const allowedMentions = {};
        const contentMention = ROLE_IDS_ARRAY.length ? ROLE_IDS_ARRAY.map(r => `<@&${r}>`).join(' ') : '';

        const sent = await ch.send({ content: `${contentMention || ''}`, embeds: [embed] }).catch((e)=>{ console.error('send err', e); return null; });
        if (sent) {
          // создаём тред для обсуждения (если возможно)
          try {
            const thread = sent.startThread ? await sent.startThread({ name: `Заявка — ${yourName.slice(0, 50)}` }) : null;
            if (thread) {
              await thread.send(`Новая заявка принята в тред для обсуждения. ${contentMention || ''}`).catch(()=>{});
            }
          } catch(e) { /* ignore */ }
          await interaction.reply({ content: 'Заявка отправлена.', ephemeral: true });
        } else {
          await interaction.reply({ content: 'Не удалось отправить заявку — проверьте права бота в канале.', ephemeral: true });
        }

        return;
      }
    }

  } catch (err) {
    console.error('Ошибка взаимодействия:', err);
    // безопасно отвечаем пользователю если интеракция живa и не ответили
    try {
      if (interaction && !interaction.replied) {
        await interaction.reply({ content: 'Произошла ошибка, администратор уведомлён.', ephemeral: true });
      }
    } catch {}
  }
});

// логин
client.login(DISCORD_TOKEN).catch(err => {
  console.error('Не удалось залогиниться — проверьте DISCORD_TOKEN:', err);
});
