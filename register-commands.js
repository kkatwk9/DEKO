// register-commands.js (ESM)
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
  console.error('ERROR: DISCORD_TOKEN, CLIENT_ID и GUILD_ID должны быть заданы в .env / переменных Railway');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('apply-panel')
    .setDescription('Отправить панель заявок'),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Создать эмбэд')
    .addStringOption(o => o.setName('title').setDescription('Заголовок').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Описание').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Цвет #hex').setRequired(false)),

  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Создать запись аудита')
    .addUserOption(o => o.setName('author').setDescription('Кто совершил действие').setRequired(true))
    .addUserOption(o => o.setName('target').setDescription('Кого касается действие').setRequired(true))
    .addStringOption(o => o.setName('action').setDescription('Тип действия').setRequired(true)
      .addChoices(
        { name: 'Повышение', value: 'promote' },
        { name: 'Понижение', value: 'demote' },
        { name: 'Выговор', value: 'warn' },
        { name: 'Увольнение', value: 'fire' },
        { name: 'Выдача ранга', value: 'give_rank' }
      ))
    .addStringOption(o => o.setName('from_rank').setDescription('С какого ранга').setRequired(false))
    .addStringOption(o => o.setName('to_rank').setDescription('На какой ранг').setRequired(false))
    .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(false)),

  new SlashCommandBuilder()
    .setName('blacklist-add')
    .setDescription('Добавить статик/участника в черный список')
    .addStringOption(o => o.setName('static').setDescription('Статик/имя участника (пример: FamilyName #1234)').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Срок (например 30d / permanent)').setRequired(false))
    .addUserOption(o => o.setName('target').setDescription('Упомянуть пользователя (если есть)').setRequired(false))

].map(c => c.toJSON());

async function register() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    console.log('Registering slash commands for guild', GUILD_ID);
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered for guild', GUILD_ID);
    process.exit(0);
  } catch (err) {
    console.error('Slash registration error:', err);
    process.exit(1);
  }
}

register();
