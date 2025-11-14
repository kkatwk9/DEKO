// register-commands.js (ESM)
import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { SlashCommandBuilder } from 'discord.js';

const {
  DISCORD_TOKEN,
  CLIENT_ID, // обязательно numeric Application ID (число)
  GUILD_ID // если пустой -> зарегистрирует глобально (занимает время)
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Нужно задать DISCORD_TOKEN и CLIENT_ID в .env (CLIENT_ID = Application ID)');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName('apply-panel').setDescription('Опубликовать панель заявок'),
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Создать эмбэд')
    .addStringOption(o => o.setName('title').setDescription('Заголовок').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Текст эмбэда').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Hex цвет, например #ff66aa').setRequired(false)),
  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Запись в логи аудита')
    .addUserOption(o => o.setName('author').setDescription('Кто совершил действие').setRequired(true))
    .addUserOption(o => o.setName('target').setDescription('Кого это касается').setRequired(true))
    .addStringOption(o =>
      o.setName('action').setDescription('Действие').setRequired(true).addChoices(
        { name: 'Повышение', value: 'promote' },
        { name: 'Понижение', value: 'demote' },
        { name: 'Выговор', value: 'warn' },
        { name: 'Увольнение', value: 'fire' },
        { name: 'Выдача ранга', value: 'give_rank' }
      )
    )
    .addStringOption(o => o.setName('from_rank').setDescription('С какого ранга').setRequired(false).addChoices(
      { name: '8 — Generalisimus', value: '8' },
      { name: '7 — Vice Gen.', value: '7' },
      { name: '6 — Gen. Secretary', value: '6' },
      { name: '5 — Curator', value: '5' },
      { name: "4 — Curator's Office", value: '4' },
      { name: '3 — Stacked', value: '3' },
      { name: '2 — Main', value: '2' },
      { name: '1 — NewBie', value: '1' }
    ))
    .addStringOption(o => o.setName('to_rank').setDescription('На какой ранг').setRequired(false).addChoices(
      { name: '8 — Generalisimus', value: '8' },
      { name: '7 — Vice Gen.', value: '7' },
      { name: '6 — Gen. Secretary', value: '6' },
      { name: '5 — Curator', value: '5' },
      { name: "4 — Curator's Office", value: '4' },
      { name: '3 — Stacked', value: '3' },
      { name: '2 — Main', value: '2' },
      { name: '1 — NewBie', value: '1' }
    ))
    .addStringOption(o => o.setName('reason').setDescription('Причина/комментарий').setRequired(false))
].map(c => c.toJSON());

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    if (GUILD_ID) {
      console.log('Регистрация команд в гильдии', GUILD_ID);
      const res = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('Команд зарегистрировано (guild):', res.length);
    } else {
      console.log('Регистрация глобальных команд (может занять до часа)');
      const res = await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Команд зарегистрировано (global):', res.length);
    }
    console.log('Готово.');
  } catch (err) {
    console.error('Ошибка регистрации слэш-команд:', err);
    process.exit(1);
  }
})();
