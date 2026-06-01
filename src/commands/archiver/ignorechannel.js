/**
 * Command: .ignorechannel
 *
 * Disables real-time tracking for a specific channel or all channels.
 * Persists to the ignored_channels DB table.
 *
 * Usage:
 *   .ignorechannel             — ignore every channel
 *   .ignorechannel general     — ignore #general only
 */

'use strict';

const { ChannelType } = require('discord.js');
const { isAllowlisted, denyAccess } = require('../../utils/permissions');
const { resolveChannel } = require('../../utils/helpers');
const { getDb } = require('../../database/database');
const logger = require('../../utils/logger');

module.exports = {
  name: 'ignorechannel',
  description: 'Stops real-time tracking for a channel (or all channels).',
  usage: '.ignorechannel [channel name]',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);

    const guildId = message.guild.id;
    const db = getDb();

    if (!client.ignoredChannels.has(guildId)) {
      client.ignoredChannels.set(guildId, new Set());
    }

    const ignoredSet = client.ignoredChannels.get(guildId);
    const trackingSet = client.activeTracking.get(guildId);
    const channelArg = args.join(' ').trim() || null;

    if (!channelArg) {
      // Ignore ALL — remove global tracking sentinel and all individual IDs
      if (trackingSet) {
        trackingSet.clear();
      }

      db.prepare(
        "UPDATE tracked_channels SET enabled = 0 WHERE guild_id = ?"
      ).run(guildId);

      logger.info(`All tracking disabled in guild ${guildId} by ${message.author.tag}`);
      return message.reply(
        '**Tracking disabled** for all channels in this server.\n' +
        'Use `.channeltrack` to re-enable channels.'
      );
    }

    // Ignore a specific channel
    const channel = resolveChannel(message.guild, channelArg);
    if (!channel) return message.reply(`**Channel not found:** \`${channelArg}\``);

    ignoredSet.add(channel.id);

    // Remove from active tracking if it was individually tracked
    if (trackingSet) trackingSet.delete(channel.id);

    db.prepare(`
      INSERT INTO ignored_channels (guild_id, channel_id)
      VALUES (?, ?)
      ON CONFLICT(guild_id, channel_id) DO NOTHING
    `).run(guildId, channel.id);

    db.prepare(
      "UPDATE tracked_channels SET enabled = 0 WHERE guild_id = ? AND channel_id = ?"
    ).run(guildId, channel.id);

    logger.info(`Tracking disabled for #${channel.name} (${channel.id}) in guild ${guildId}`);

    return message.reply(
      `**Tracking disabled** for ${channel.toString()}.\n` +
      `New messages in that channel will no longer be archived.`
    );
  },
};
