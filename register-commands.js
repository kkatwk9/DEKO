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

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('DISCORD_TOKEN, CLIENT_ID и GUILD_ID обязательны в .env');
  process.exit(1);
}

const commands = [
  // apply-panel
  new SlashCommandBuilder()
    .setName('apply-panel')
    .setDescription('Опубликовать панель заявок'),

  // embed
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Создать эмбэд')
    .addStringOption(o => o.setName('title').setDescription('Заголовок').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Текст').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Цвет #hex например #ff66aa').setRequired(false)),

  // audit
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

  // blacklist (subcommands add/remove/list)
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
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    console.log('Registering slash commands to guild', GUILD_ID);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Slash commands registered successfully.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
})();
