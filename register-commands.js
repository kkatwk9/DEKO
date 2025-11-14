// register-commands.js
import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { SlashCommandBuilder } from 'discord.js';

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID
} = process.env;

// DEBUG: выводим проверку env
console.log('>>> register-commands: ENV CHECK');
console.log('DISCORD_TOKEN present:', !!DISCORD_TOKEN);
console.log('CLIENT_ID present:', !!CLIENT_ID, 'value:', CLIENT_ID ? CLIENT_ID.slice(0,8) + '...' : '<empty>');
console.log('GUILD_ID present:', !!GUILD_ID, 'value:', GUILD_ID ? GUILD_ID.slice(0,8) + '...' : '<empty>');
console.log('---');

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('ERROR: DISCORD_TOKEN, CLIENT_ID and GUILD_ID must be set in environment variables.');
  process.exit(1);
}

// Build commands array (same commands as in index.js)
const commands = [
  new SlashCommandBuilder()
    .setName('apply-panel')
    .setDescription('Опубликовать панель заявок'),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Создать эмбэд')
    .addStringOption(o => o.setName('title').setDescription('Заголовок').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Текст').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Цвет #hex (например #ff66aa)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Создать запись аудита')
    .addUserOption(o => o.setName('author').setDescription('Кто совершил действие').setRequired(true))
    .addUserOption(o => o.setName('target').setDescription('Кого касается действие').setRequired(true))
    .addStringOption(o => o.setName('action')
      .setDescription('Тип действия').setRequired(true)
      .addChoices(
        { name: 'Повышение', value: 'promote' },
        { name: 'Понижение', value: 'demote' },
        { name: 'Выговор', value: 'warn' },
        { name: 'Увольнение', value: 'fire' },
        { name: 'Выдача ранга', value: 'give_rank' }
      ))
    .addStringOption(o => o.setName('from_rank').setDescription('С какого ранга').addChoices(
      { name: '8 — Generalisimus', value: '8' },
      { name: '7 — Vice Gen.', value: '7' },
      { name: '6 — Gen. Secretary', value: '6' },
      { name: '5 — Curator', value: '5' },
      { name: "4 — Curator's Office", value: '4' },
      { name: '3 — Stacked', value: '3' },
      { name: '2 — Main', value: '2' },
      { name: '1 — NewBie', value: '1' }
    ))
    .addStringOption(o => o.setName('to_rank').setDescription('На какой ранг').addChoices(
      { name: '8 — Generalisimus', value: '8' },
      { name: '7 — Vice Gen.', value: '7' },
      { name: '6 — Gen. Secretary', value: '6' },
      { name: '5 — Curator', value: '5' },
      { name: "4 — Curator's Office", value: '4' },
      { name: '3 — Stacked', value: '3' },
      { name: '2 — Main', value: '2' },
      { name: '1 — NewBie', value: '1' }
    ))
    .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(false)),

  new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Управление черным списком (ЧС)')
    .addSubcommand(sc => sc.setName('add').setDescription('Добавить в ЧС')
      .addStringOption(o => o.setName('static').setDescription('Статик (например Family #1234)').setRequired(true))
      .addUserOption(o => o.setName('member').setDescription('Пользователь (если нужно)').setRequired(false))
      .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Срок (например 30d, forever)').setRequired(false))
    )
    .addSubcommand(sc => sc.setName('remove').setDescription('Удалить запись из ЧС')
      .addStringOption(o => o.setName('static').setDescription('Статик').setRequired(false))
      .addStringOption(o => o.setName('message_id').setDescription('ID сообщения в канале ЧС').setRequired(false))
    )
    .addSubcommand(sc => sc.setName('list').setDescription('Показать последние записи ЧС')
      .addIntegerOption(o => o.setName('limit').setDescription('Сколько записей показать (max 25)').setRequired(false))
    )
].map(c => c.toJSON());

(async () => {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    console.log('Registering commands to guild:', GUILD_ID);
    const res = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Registration result: OK. Registered', res.length, 'commands.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to register commands:', err);
    // show a small hint for common errors
    if (err?.status === 401) console.error('401 Unauthorized — check DISCORD_TOKEN');
    if (err?.status === 403) console.error('403 Forbidden — check bot permissions / OAuth invite scopes');
    if (err?.status === 404) console.error('404 Not Found — check CLIENT_ID and GUILD_ID are correct');
    process.exit(1);
  }
})();
