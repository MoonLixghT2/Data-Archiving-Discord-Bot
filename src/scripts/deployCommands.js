/**
 * Deploy Commands Script
 *
 * Registers all slash commands globally via the Discord REST API.
 * Run once after adding or updating slash commands:
 *   node src/scripts/deployCommands.js
 *
 * Note: Global command propagation can take up to 1 hour.
 * For instant testing use guild-specific registration (add GUILD_ID to .env).
 */

'use strict';

require('dotenv').config();

const { REST, Routes } = require('@discordjs/rest');
const fs = require('fs');
const path = require('path');

const TOKEN     = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID; // Optional: set for instant guild-scoped deployment

if (!TOKEN || !CLIENT_ID) {
  console.error('Missing BOT_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

const COMMANDS_DIR = path.join(__dirname, '../commands');
const slashCommands = [];

const categories = fs.readdirSync(COMMANDS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const category of categories) {
  const files = fs
    .readdirSync(path.join(COMMANDS_DIR, category))
    .filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const mod = require(path.join(COMMANDS_DIR, category, file));

    const candidates = mod.data
      ? [mod]
      : Object.values(mod).filter((v) => v && v.data && typeof v.execute === 'function');

    for (const cmd of candidates) {
      if (cmd.data) slashCommands.push(cmd.data.toJSON());
    }
  }
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log(`Deploying ${slashCommands.length} slash command(s)...`);

    const route = GUILD_ID
      ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
      : Routes.applicationCommands(CLIENT_ID);

    await rest.put(route, { body: slashCommands });

    const scope = GUILD_ID ? `guild ${GUILD_ID}` : 'global';
    console.log(`Successfully deployed ${slashCommands.length} command(s) to ${scope}.`);
  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
})();
