/**
 * Command: .allowlist
 *
 * Displays all user IDs currently on the allowlist.
 * Owner-only command.
 *
 * Usage:
 *   .allowlist
 */

'use strict';

const { EmbedBuilder } = require('discord.js');
const { isOwner, denyAccess } = require('../../utils/permissions');
const { getAllowedUsers } = require('../../utils/allowlist');

module.exports = {
  name: 'allowlist',
  description: 'Shows all users on the bot allowlist. Owner only.',
  usage: '.allowlist',
  ownerOnly: true,

  async execute(message, args, client) {
    if (!isOwner(message)) {
      return denyAccess(message, 'Only the bot owner can view the allowlist.');
    }

    const users = getAllowedUsers();

    const embed = new EmbedBuilder()
      .setTitle('Bot Allowlist')
      .setColor(0x5865F2)
      .setFooter({ text: `${users.length} user(s) on the allowlist` })
      .setTimestamp();

    if (users.length === 0) {
      embed.setDescription(
        'The allowlist is empty.\nUse `.allowuser <user_id>` to add users.'
      );
    } else {
      const entries = users
        .map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`)
        .join('\n');
      embed.setDescription(entries);
    }

    return message.reply({ embeds: [embed] });
  },
};
