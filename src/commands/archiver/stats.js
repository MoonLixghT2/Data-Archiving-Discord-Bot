/**
 * Command: .stats
 *
 * Displays archival statistics for the current server including
 * message counts, attachment counts, active tracking, and voice sessions.
 */

'use strict';

const { EmbedBuilder } = require('discord.js');
const { isAllowlisted, denyAccess } = require('../../utils/permissions');
const { getArchiveStats, getStorageStats } = require('../../services/storageService');
const { formatBytes } = require('../../utils/helpers');

module.exports = {
  name: 'stats',
  description: 'Displays archive statistics for this server.',
  usage: '.stats',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);

    const guildId = message.guild.id;
    const stats = getArchiveStats(guildId);
    const storage = getStorageStats(guildId);

    const trackingSet = client.activeTracking.get(guildId);
    const isAllTracked = trackingSet?.has('*');
    const trackedCount = isAllTracked
      ? `All channels`
      : `${trackingSet?.size || 0} channel(s)`;

    const voiceActive = client.voiceSessions.has(guildId) ? 'Yes (active)' : 'No';

    const embed = new EmbedBuilder()
      .setTitle(`Archive Statistics — ${message.guild.name}`)
      .setColor(0x57F287)
      .setThumbnail(message.guild.iconURL())
      .addFields(
        { name: 'Total Messages Archived', value: stats.messages.toLocaleString(), inline: true },
        { name: 'Deleted Messages Logged', value: stats.deletedMessages.toLocaleString(), inline: true },
        { name: 'Attachments Downloaded', value: stats.attachments.toLocaleString(), inline: true },
        { name: 'Tracked Channels', value: trackedCount, inline: true },
        { name: 'Voice Sessions', value: stats.voiceSessions.toString(), inline: true },
        { name: 'Voice Recording Active', value: voiceActive, inline: true },
        { name: 'Total Storage Used', value: formatBytes(storage.total), inline: true },
        { name: 'Database Size', value: formatBytes(storage.db), inline: true },
        { name: 'Cache Size', value: formatBytes(storage.cache), inline: true }
      )
      .setFooter({ text: `Server ID: ${guildId}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};
