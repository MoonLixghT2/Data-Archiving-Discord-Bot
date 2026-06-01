/**
 * Command: .export
 *
 * Exports archived messages to a file in the requested format.
 * Uploads the file directly to Discord if under 25 MB; otherwise provides the local path.
 *
 * Usage:
 *   .export json               — export all channels as JSON
 *   .export csv general        — export #general as CSV
 *   .export pdf general        — export #general as PDF
 *
 * Supported formats: txt, json, jsonl, csv, pdf
 */

'use strict';

const fs = require('fs');
const { isAllowlisted, denyAccess } = require('../../utils/permissions');
const { resolveChannel, formatBytes } = require('../../utils/helpers');
const { exportMessages } = require('../../services/exportService');
const logger = require('../../utils/logger');

const SUPPORTED_FORMATS = ['txt', 'json', 'jsonl', 'csv', 'pdf'];
const DISCORD_UPLOAD_LIMIT = 24 * 1024 * 1024; // 24 MB

module.exports = {
  name: 'export',
  description: 'Exports archived messages to TXT, JSON, JSONL, CSV, or PDF.',
  usage: '.export <format> [channel name]',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);

    const format = args[0]?.toLowerCase();
    const channelArg = args.slice(1).join(' ').trim() || null;

    if (!format || !SUPPORTED_FORMATS.includes(format)) {
      return message.reply(
        `**Invalid format.** Supported: \`${SUPPORTED_FORMATS.join(', ')}\`\n` +
        `Usage: \`.export <format> [channel name]\``
      );
    }

    let channelId = null;
    let channelName = 'all-channels';

    if (channelArg) {
      const channel = resolveChannel(message.guild, channelArg);
      if (!channel) return message.reply(`**Channel not found:** \`${channelArg}\``);
      channelId = channel.id;
      channelName = channel.name;
    }

    const statusMsg = await message.reply(
      `**Generating ${format.toUpperCase()} export** for \`${channelName}\`...`
    );

    try {
      const filePath = await exportMessages(
        message.guild.id,
        channelId,
        format,
        channelName
      );

      const fileSize = fs.statSync(filePath).size;

      logger.info(
        `Export complete: ${filePath} (${formatBytes(fileSize)}) ` +
        `by ${message.author.tag} in guild ${message.guild.id}`
      );

      if (fileSize <= DISCORD_UPLOAD_LIMIT) {
        await statusMsg.edit(`**Export complete** (${formatBytes(fileSize)})`);
        await message.channel.send({
          content: `**${format.toUpperCase()} Export** — \`${channelName}\``,
          files: [{ attachment: filePath, name: require('path').basename(filePath) }],
        });
      } else {
        await statusMsg.edit(
          `**Export complete** — file too large for Discord upload (${formatBytes(fileSize)}).\n` +
          `**Saved locally:** \`${filePath}\``
        );
      }
    } catch (error) {
      logger.error(`Export failed: ${error.message}`);
      await statusMsg.edit(`**Export failed:** ${error.message}`);
    }
  },
};
