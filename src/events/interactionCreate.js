/**
 * Event: interactionCreate
 *
 * Routes incoming slash command interactions to the correct handler.
 * All slash commands are public (music system) — no allowlist check here.
 * Individual commands enforce their own restrictions if needed.
 */

'use strict';

const logger = require('../utils/logger');

module.exports = {
  name: 'interactionCreate',

  async execute(client, interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.slashCommands.get(interaction.commandName);

    if (!command) {
      logger.warn(`Unknown slash command received: /${interaction.commandName}`);
      await interaction
        .reply({ content: 'Unknown command.', ephemeral: true })
        .catch(() => {});
      return;
    }

    // Defer immediately so Discord doesn't time out the interaction (3 s limit),
    // then wait a random 5–10 s before actually running the command.
    await interaction.deferReply().catch(() => {});
    // Neutralise any subsequent deferReply() calls inside commands (e.g. /play)
    // so they don't throw "interaction already replied".
    interaction.deferReply = () => Promise.resolve();

    const delay = Math.floor(Math.random() * 6000) + 5000; // 5000–10999 ms
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await command.execute(interaction, client);
    } catch (error) {
      logger.error(
        `Error executing slash command "/${interaction.commandName}": ${error.message}`,
        { stack: error.stack }
      );

      const payload = { content: 'An internal error occurred.', ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
