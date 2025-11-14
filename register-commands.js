// register-commands.js (debug-heavy)
import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { SlashCommandBuilder } from 'discord.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

// quick visible debug
console.log('--- register-commands debug start ---');
console.log('DISCORD_TOKEN set:', !!DISCORD_TOKEN);
console.log('CLIENT_ID set:', !!CLIENT_ID);
console.log('GUILD_ID set:', !!GUILD_ID);
console.log('CLIENT_ID (first 12 chars):', (CLIENT_ID || '').slice(0, 12));
console.log('GUILD_ID (first 12 chars):', (GUILD_ID || '').slice(0, 12));
console.log('Node version:', process.version);

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Required env vars missing. Exiting.');
  process.exit(1);
}

// define small test command set (add blacklist if you want)
const commands = [
  new SlashCommandBuilder().setName('dbg-ping').setDescription('debug ping'),
  new SlashCommandBuilder().setName('dbg-listcmds').setDescription('debug list commands (no-op)')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Attempting to PUT to /applications/${CLIENT_ID}/guilds/${GUILD_ID}/commands`);
    const res = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('PUT completed. Server returned:');
    console.log(JSON.stringify(res, null, 2).slice(0, 4000)); // print first part
    console.log('--- register-commands debug finished SUCCESS ---');
  } catch (err) {
    console.error('--- register-commands debug ERROR ---');
    // print as much useful info as possible
    console.error('Error name:', err?.name);
    console.error('Error message:', err?.message);
    if (err?.stack) console.error('Stack:', err.stack.slice(0, 2000));
    // if REST error has status / body
    if (err?.status) console.error('HTTP status:', err.status);
    if (err?.body) {
      try {
        console.error('Body:', JSON.stringify(err.body).slice(0, 2000));
      } catch {}
    }
    process.exit(1);
  }
})();
