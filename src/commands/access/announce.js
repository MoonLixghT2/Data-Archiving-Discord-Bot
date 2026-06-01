/**
 * Command: .announce
 *
 * Sends a formatted announcement embed to any channel in the current server.
 * Owner-only command.
 *
 * Usage:
 *   .announce <channel> <message text>
 *
 * Examples:
 *   .announce general Server maintenance in 10 minutes.
 *   .announce 987654321098765432 Welcome everyone to the new season!
 */

'use strict';

const { EmbedBuilder } = require('discord.js');
const { isOwner, denyAccess } = require('../../utils/permissions');
const { resolveChannel } = require('../../utils/helpers');

module.exports = {
  name: 'announce',
  description: 'Sends a formatted announcement to any channel. Owner only.',
  usage: '.announce <channel> <message>',
  ownerOnly: true,

  async execute(message, args, client) {
    if (!isOwner(message)) {
      return denyAccess(message, 'Only the bot owner can send announcements.');
    }

    if (args.length < 2) {
      return message.reply(
        '**Usage:** `.announce <channel> <message>`\n' +
        'Example: `.announce general Server restart in 5 minutes.`'
      );
    }

    const channelArg   = args[0];
    const announcement = args.slice(1).join(' ').trim();

    if (!announcement) {
      return message.reply('**Error:** Announcement text cannot be empty.');
    }

    const targetChannel = resolveChannel(message.guild, channelArg);

    if (!targetChannel) {
      return message.reply(`**Channel not found:** \`${channelArg}\``);
    }

    if (!targetChannel.isTextBased()) {
      return message.reply('**Error:** That channel does not support messages.');
    }

    const botPerms = targetChannel.permissionsFor(message.guild.members.me);
    if (!botPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      return message.reply(
        `**Permission Error:** I cannot send messages in ${targetChannel.toString()}.\n` +
        `Ensure I have **View Channel**, **Send Messages**, and **Embed Links** permissions there.`
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('Announcement')
      .setDescription(announcement)
      .setFooter({ text: `From: ${message.author.tag}` })
      .setTimestamp();

    try {
      await targetChannel.send({ embeds: [embed] });
      await message.reply(`**Announcement sent** to ${targetChannel.toString()}.`);
    } catch (error) {
      await message.reply(`**Failed to send announcement:** ${error.message}`);
    }
  },
};
