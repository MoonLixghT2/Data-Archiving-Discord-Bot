/**
 * Event: messageCreate
 *
 * Two responsibilities:
 * 1. Route prefix commands (messages starting with the configured prefix)
 * 2. Real-time archive messages in tracked channels (if not bot and not ignored)
 */

'use strict';

const { getPrefix } = require('../utils/config');
const { archiveMessage } = require('../services/archiverService');
const logger = require('../utils/logger');

module.exports = {
  name: 'messageCreate',

  async execute(client, message) {
    // Ignore DMs and other bots
    if (!message.guild || message.author.bot) return;

    const prefix = getPrefix();

    // ── Real-Time Tracking ─────────────────────────────────────────────────
    const guildTracking = client.activeTracking.get(message.guildId);
    const guildIgnored = client.ignoredChannels.get(message.guildId);
    const isIgnored = guildIgnored?.has(message.channelId);
    const isTracked =
      guildTracking?.has(message.channelId) ||
      guildTracking?.has('*'); // '*' means track all channels

    if (isTracked && !isIgnored && !message.content.startsWith(prefix)) {
      // Archive in background — do not block event handling
      archiveMessage(message, false).catch((err) =>
        logger.error(`Real-time archive error: ${err.message}`)
      );
    }

    // ── Prefix Command Routing ─────────────────────────────────────────────
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    if (!commandName) return;

    const command = client.commands.get(commandName);
    if (!command) return;

    // Show typing indicator then wait a random 1–2 s before responding
    await message.channel.sendTyping().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 1000) + 1000));

    // ── Auto-delete: schedule deletion of any message the bot sends in this
    //    channel 10 seconds after it is posted. Wrapping here means every
    //    command gets the behaviour automatically with no per-command changes.
    //    DMs (message.author.send) are intentionally left untouched.
    const scheduleDelete = (promise) =>
      Promise.resolve(promise)
        .then((sent) => {
          if (sent?.deletable) setTimeout(() => sent.delete().catch(() => {}), 10_000);
          return sent;
        })
        .catch(() => {});

    const _channelSend = message.channel.send.bind(message.channel);
    message.channel.send = (...args) => scheduleDelete(_channelSend(...args));

    const _reply = message.reply.bind(message);
    message.reply = (...args) => scheduleDelete(_reply(...args));

    try {
      await command.execute(message, args, client);
    } catch (error) {
      logger.error(`Error executing prefix command "${commandName}": ${error.message}`, {
        stack: error.stack,
      });
      await message
        .reply(`An internal error occurred while running that command.`)
        .catch(() => {});
    }
  },
};
