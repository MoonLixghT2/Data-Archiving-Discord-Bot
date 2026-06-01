/**
 * Command: .channeltrack
 *
 * Enables real-time message archiving for a specific channel or all channels.
 * Tracking persists across bot restarts via the tracked_channels DB table.
 *
 * Usage:
 *   .channeltrack             — track every channel in the server
 *   .channeltrack general     — track only #general
 */

'use strict';

const { ChannelType } = require('discord.js');
const { isAllowlisted, denyAccess } = require('../../utils/permissions');
const { resolveChannel } = require('../../utils/helpers');
const { getDb } = require('../../database/database');
const logger = require('../../utils/logger');

module.exports = {
  name: 'channeltrack',
  description: 'Enables real-time tracking for a channel (or all channels).',
  usage: '.channeltrack [channel name]',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);

    const guildId = message.guild.id;
    const db = getDb();

    // Ensure guild tracking map exists
    if (!client.activeTracking.has(guildId)) {
      client.activeTracking.set(guildId, new Set());
    }

    const trackingSet = client.activeTracking.get(guildId);
    const channelArg = args.join(' ').trim() || null;

    if (!channelArg) {
      // Track ALL channels — use sentinel '*'
      trackingSet.add('*');

      db.prepare(`
        INSERT INTO tracked_channels (guild_id, channel_id, enabled)
        VALUES (?, '*', 1)
        ON CONFLICT(guild_id, channel_id) DO UPDATE SET enabled = 1
      `).run(guildId, '*');

      logger.info(`All-channel tracking enabled in guild ${guildId} by ${message.author.tag}`);
      return message.reply(
        '**Real-time tracking enabled** for all channels in this server.\n' +
        'Use `.ignorechannel <name>` to exclude specific channels.'
      );
    }

    // Track a specific channel
    const channel = resolveChannel(message.guild, channelArg);
    if (!channel) return message.reply(`**Channel not found:** \`${channelArg}\``);

    if (channel.type !== ChannelType.GuildText) {
      return message.reply('**Error:** Only text channels can be tracked.');
    }

    trackingSet.add(channel.id);

    db.prepare(`
      INSERT INTO tracked_channels (guild_id, channel_id, enabled)
      VALUES (?, ?, 1)
      ON CONFLICT(guild_id, channel_id) DO UPDATE SET enabled = 1
    `).run(guildId, channel.id);

    logger.info(`Tracking enabled for #${channel.name} (${channel.id}) in guild ${guildId}`);

    return message.reply(
      `**Real-time tracking enabled** for ${channel.toString()}.\n` +
      `All new messages will be archived automatically.`
    );
  },
};
