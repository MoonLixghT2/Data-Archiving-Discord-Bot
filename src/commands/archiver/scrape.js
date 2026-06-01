/**
 * Command: .scrape
 *
 * Scrapes historical messages from one or all text channels in the current server.
 * Supports optional attachment downloading and is resumable after interruption.
 *
 * Usage:
 *   .scrape                               — scrape all channels, no attachments
 *   .scrape true                          — scrape all channels + download attachments
 *   .scrape false general                 — scrape #general, no attachments
 *   .scrape true general                  — scrape #general + download attachments
 */

'use strict';

const { ChannelType } = require('discord.js');
const { isAllowlisted, denyAccess } = require('../../utils/permissions');
const { scrapeChannel } = require('../../services/archiverService');
const { resolveChannel } = require('../../utils/helpers');
const { writeGuildMetadata } = require('../../services/metadataService');
const logger = require('../../utils/logger');

// Track active scrapes per guild to prevent duplicate runs
const activeScrapes = new Set();

module.exports = {
  name: 'scrape',
  description: 'Scrapes historical messages from one or all channels.',
  usage: '.scrape <true|false> [channel name]',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);

    const guildId = message.guild.id;

    if (activeScrapes.has(guildId)) {
      return message.reply(
        '**Scrape already in progress** for this server. Wait for it to finish before starting another.'
      );
    }

    // Parse arguments
    const downloadAttachments = args[0]?.toLowerCase() === 'true';
    const channelArg = args.slice(1).join(' ') || null;

    // Resolve target channels
    let targetChannels = [];

    if (channelArg) {
      const ch = resolveChannel(message.guild, channelArg);
      if (!ch) return message.reply(`**Channel not found:** \`${channelArg}\``);
      if (ch.type !== ChannelType.GuildText) {
        return message.reply('**Error:** Only text channels can be scraped.');
      }
      targetChannels = [ch];
    } else {
      targetChannels = message.guild.channels.cache
        .filter((ch) => ch.type === ChannelType.GuildText && ch.viewable)
        .map((ch) => ch);
    }

    if (targetChannels.length === 0) {
      return message.reply('**No accessible text channels found** in this server.');
    }

    activeScrapes.add(guildId);

    const startMsg = await message.reply(
      `**Scrape started** — ${targetChannels.length} channel(s) | ` +
      `Attachments: \`${downloadAttachments ? 'yes' : 'no'}\`\n` +
      `This may take a while for large servers. I will report when complete.`
    );

    // Snapshot guild metadata before starting
    writeGuildMetadata(message.guild);

    logger.info(
      `Scrape initiated by ${message.author.tag} in guild ${guildId}. ` +
      `Channels: ${targetChannels.length}, Attachments: ${downloadAttachments}`
    );

    // Run scrape in background so the command returns immediately
    (async () => {
      let totalMessages = 0;
      let completedChannels = 0;
      const errors = [];

      for (const channel of targetChannels) {
        try {
          const count = await scrapeChannel(channel, downloadAttachments, (archived) => {
            // Optional: update progress message periodically
          });
          totalMessages += count;
          completedChannels++;

          logger.info(`Scrape progress: #${channel.name} done (${count} msgs). ${completedChannels}/${targetChannels.length} channels.`);
        } catch (err) {
          errors.push(`#${channel.name}: ${err.message}`);
          logger.error(`Scrape failed for #${channel.name}: ${err.message}`);
        }
      }

      activeScrapes.delete(guildId);

      let summary =
        `**Scrape Complete**\n` +
        `- Channels processed: ${completedChannels}/${targetChannels.length}\n` +
        `- Total messages archived: ${totalMessages.toLocaleString()}\n` +
        `- Attachments downloaded: ${downloadAttachments ? 'yes' : 'no'}`;

      if (errors.length) {
        summary += `\n- **Errors (${errors.length}):**\n${errors.slice(0, 5).map((e) => `  - ${e}`).join('\n')}`;
      }

      await message.author.send(summary).catch(() => {});
    })();
  },
};
