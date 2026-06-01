/**
 * Event: ready
 * Fires once when the bot successfully connects and is ready to operate.
 * Registers slash commands globally.
 */

'use strict';

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  name: 'ready',
  once: true,

  async execute(client) {
    logger.info(`Logged in as ${client.user.tag} — serving ${client.guilds.cache.size} guild(s).`);
    client.user.setActivity('Archiving | .cmds for help');

    // Register slash commands globally
    const slashData = [...client.slashCommands.values()].map((cmd) => cmd.data.toJSON());

    if (slashData.length === 0) {
      logger.warn('No slash commands found to register.');
      return;
    }

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    try {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: slashData }
      );
      logger.info(`Registered ${slashData.length} slash command(s) globally.`);
    } catch (error) {
      logger.error(`Failed to register slash commands: ${error.message}`, { stack: error.stack });
    }
  },
};
