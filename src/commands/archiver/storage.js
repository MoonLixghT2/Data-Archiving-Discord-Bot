/**
 * Command: .storage
 *
 * Displays a detailed disk usage breakdown for the bot's data directory,
 * including attachments, voice recordings, exports, backups, and cache.
 */

'use strict';

const { EmbedBuilder } = require('discord.js');
const { isAllowlisted, denyAccess } = require('../../utils/permissions');
const { getStorageStats } = require('../../services/storageService');
const { formatBytes, getStoragePath } = require('../../utils/helpers');
const { getConfig } = require('../../utils/config');
const path = require('path');
const fs = require('fs');

module.exports = {
  name: 'storage',
  description: 'Shows a detailed disk usage breakdown of the archive data directory.',
  usage: '.storage',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);

    const cfg = getConfig();
    const storagePath = cfg.storagePath;
    const guildId = message.guild.id;

    const stats = getStorageStats(guildId);

    // Per-channel breakdown from stored files
    const channelsBasePath = path.join(storagePath, 'servers', guildId, 'channels');
    const channelBreakdown = [];

    if (fs.existsSync(channelsBasePath)) {
      const channelFolders = fs.readdirSync(channelsBasePath);
      for (const folderName of channelFolders.slice(0, 8)) {
        const chPath = path.join(channelsBasePath, folderName);
        const { getDirSize } = require('../../utils/helpers');
        const size = getDirSize(chPath);
        if (size > 0) {
          channelBreakdown.push(`#${folderName}: **${formatBytes(size)}**`);
        }
      }
    }

    const voicePath = path.join(storagePath, 'servers', guildId, 'voice');
    const voiceSize = fs.existsSync(voicePath)
      ? require('../../utils/helpers').getDirSize(voicePath)
      : 0;

    const exportsPath = path.join(storagePath, 'servers', guildId, 'exports');
    const exportsSize = fs.existsSync(exportsPath)
      ? require('../../utils/helpers').getDirSize(exportsPath)
      : 0;

    const embed = new EmbedBuilder()
      .setTitle(`Storage Breakdown — ${message.guild.name}`)
      .setColor(0xFEE75C)
      .addFields(
        { name: 'Total Data Directory', value: formatBytes(stats.total), inline: true },
        { name: 'Database (archiver.db)', value: formatBytes(stats.db), inline: true },
        { name: 'Cache', value: formatBytes(stats.cache), inline: true },
        { name: 'Backups', value: formatBytes(stats.backups), inline: true },
        { name: 'Voice Recordings', value: formatBytes(voiceSize), inline: true },
        { name: 'Exports', value: formatBytes(exportsSize), inline: true },
      )
      .setFooter({ text: `Storage root: ${storagePath}` })
      .setTimestamp();

    if (channelBreakdown.length) {
      embed.addFields({
        name: 'Channel Storage (top channels)',
        value: channelBreakdown.join('\n'),
        inline: false,
      });
    }

    await message.reply({ embeds: [embed] });
  },
};
