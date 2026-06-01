/**
 * Command: .joinvc
 *
 * Joins a voice channel and starts recording all participants' audio
 * to separate WAV files saved in the organized voice directory.
 *
 * Usage:
 *   .joinvc General          — join the "General" voice channel
 *   .joinvc 987654321        — join by channel ID
 */

'use strict';

const { ChannelType } = require('discord.js');
const { isAllowlisted, denyAccess } = require('../../utils/permissions');
const { resolveChannel } = require('../../utils/helpers');
const { startRecording } = require('../../services/voiceRecorder');
const logger = require('../../utils/logger');

module.exports = {
  name: 'joinvc',
  description: 'Joins a voice channel and starts recording audio.',
  usage: '.joinvc <channel name or ID>',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);

    const channelArg = args.join(' ').trim();
    if (!channelArg) {
      return message.reply(
        '**Usage:** `.joinvc <channel name or ID>`\n' +
        'Example: `.joinvc General`'
      );
    }

    const channel = resolveChannel(message.guild, channelArg);

    if (!channel) {
      return message.reply(`**Channel not found:** \`${channelArg}\``);
    }

    if (
      channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildStageVoice
    ) {
      return message.reply('**Error:** That is not a voice channel.');
    }

    // Check bot permissions
    const permissions = channel.permissionsFor(message.guild.members.me);
    if (!permissions?.has(['Connect', 'Speak'])) {
      return message.reply(
        '**Permission Error:** I need **Connect** and **Speak** permissions in that voice channel.'
      );
    }

    const statusMsg = await message.reply(
      `**Joining** ${channel.name}...`
    );

    try {
      const session = await startRecording(channel, client);

      logger.voice.info(
        `Recording session started in #${channel.name} (${channel.id}) ` +
        `by ${message.author.tag} in guild ${message.guild.id}`
      );

      await statusMsg.edit(
        `**Voice recording started** in **${channel.name}**.\n` +
        `- Each user's audio is saved to a separate WAV file.\n` +
        `- Use \`.dc\` to stop recording and disconnect.`
      );
    } catch (error) {
      logger.error(`Failed to start voice recording: ${error.message}`);
      await statusMsg.edit(`**Failed to join voice channel:** ${error.message}`);
    }
  },
};
