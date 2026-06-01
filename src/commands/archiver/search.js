/**
 * Command: .search
 *
 * Performs a keyword search against archived messages.
 * Supports optional user and channel filters with paginated results.
 *
 * Usage:
 *   .search hello
 *   .search hello 123456789012345678
 *   .search hello 123456789012345678 general
 *   .search hello -- --channel general --page 2
 *
 * Argument parsing (positional):
 *   arg[0]  = keyword
 *   arg[1]  = optional user ID
 *   arg[2]  = optional channel name or ID
 *   --page N = page number (default 1)
 */

'use strict';

const { EmbedBuilder } = require('discord.js');
const { isAllowlisted, denyAccess } = require('../../utils/permissions');
const { resolveChannel } = require('../../utils/helpers');
const { searchMessages, highlightKeyword, PAGE_SIZE } = require('../../services/searchService');
const logger = require('../../utils/logger');

module.exports = {
  name: 'search',
  description: 'Searches archived messages by keyword, user, or channel.',
  usage: '.search <keyword> [userID] [channel] [--page N]',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);

    if (args.length === 0) {
      return message.reply(
        `**Usage:** \`.search <keyword> [userID] [channel] [--page N]\`\n` +
        `Example: \`.search hello 123456789 general\``
      );
    }

    // Parse --page flag
    let page = 1;
    const pageIdx = args.indexOf('--page');
    if (pageIdx !== -1) {
      page = parseInt(args[pageIdx + 1], 10) || 1;
      args.splice(pageIdx, 2);
    }

    const keyword   = args[0] || null;
    const userId    = args[1] && /^\d+$/.test(args[1]) ? args[1] : null;
    const channelArg = args[2] ? args.slice(2).join(' ') : null;

    let channelId = null;
    if (channelArg) {
      const ch = resolveChannel(message.guild, channelArg);
      if (!ch) return message.reply(`**Channel not found:** \`${channelArg}\``);
      channelId = ch.id;
    }

    try {
      const { results, total, totalPages } = searchMessages({
        guildId: message.guild.id,
        keyword,
        userId,
        channelId,
        page,
      });

      if (total === 0) {
        return message.reply(
          `**No results found** for keyword \`${keyword}\`${userId ? ` from user \`${userId}\`` : ''}.`
        );
      }

      const embed = new EmbedBuilder()
        .setTitle(`Search Results — "${keyword || '(all)'}"`)
        .setColor(0x5865F2)
        .setFooter({ text: `Page ${page}/${totalPages} — ${total} total results` })
        .setTimestamp();

      const lines = results.map((m) => {
        const ts = new Date(m.timestamp).toLocaleDateString();
        const preview = highlightKeyword(
          (m.content || '(no content)').slice(0, 80),
          keyword
        );
        const deleted = m.is_deleted ? ' ~~[deleted]~~' : '';
        return `**${m.author_username}**${deleted} in <#${m.channel_id}> \`${ts}\`\n${preview}`;
      });

      embed.setDescription(lines.join('\n\n') || 'No content to display.');

      if (userId) embed.addFields({ name: 'Filtered by user', value: `<@${userId}>`, inline: true });
      if (channelId) embed.addFields({ name: 'Filtered by channel', value: `<#${channelId}>`, inline: true });

      if (totalPages > 1) {
        embed.addFields({
          name: 'Navigation',
          value: `Use \`--page N\` to navigate. E.g. \`.search ${keyword} --page ${Math.min(page + 1, totalPages)}\``,
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Search failed: ${error.message}`);
      await message.reply(`**Search failed:** ${error.message}`);
    }
  },
};
