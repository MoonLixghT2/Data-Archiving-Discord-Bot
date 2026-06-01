/**
 * Command: .dc
 *
 * Safely disconnects the bot from its active voice channel in the current server.
 * Finalizes all in-progress audio recordings and saves session metadata to the database.
 *
 * Usage:
 *   .dc
 */

'use strict';

const { isAllowlisted, denyAccess } = require('../../utils/permissions');
const { stopRecording } = require('../../services/voiceRecorder');
const logger = require('../../utils/logger');

module.exports = {
  name: 'dc',
  description: 'Disconnects from the active voice channel and saves all recordings.',
  usage: '.dc',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);

    const guildId = message.guild.id;
    const session = client.voiceSessions.get(guildId);

    // Also handle music queue disconnection if active
    const musicQueue = client.musicQueues.get(guildId);

    if (!session && !musicQueue) {
      return message.reply('**Not currently in a voice channel.**');
    }

    const statusMsg = await message.reply('**Disconnecting from voice...**');

    try {
      // Stop archiver recording session if active
      if (session) {
        const completed = await stopRecording(guildId, client);

        logger.voice.info(
          `Recording session ended in guild ${guildId} ` +
          `by ${message.author.tag}. Files: ${completed?.filePaths?.length || 0}`
        );

        await statusMsg.edit(
          `**Voice session ended.**\n` +
          `- Channel: **${completed?.channelName || 'Unknown'}**\n` +
          `- Recordings saved: **${completed?.filePaths?.length || 0}** file(s)\n` +
          `- Session logged to database.`
        );
      }

      // Disconnect music queue if active
      if (musicQueue) {
        const { destroyQueue } = require('../../services/musicPlayer');
        destroyQueue(client, guildId);

        if (!session) {
          await statusMsg.edit('**Music playback stopped** and disconnected from voice.');
        }
      }
    } catch (error) {
      logger.error(`Disconnect failed in guild ${guildId}: ${error.message}`);
      await statusMsg.edit(`**Disconnect error:** ${error.message}`);
    }
  },
};
