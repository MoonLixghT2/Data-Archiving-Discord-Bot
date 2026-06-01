/**
 * Command: .allowuser
 *
 * Adds a Discord user ID to the bot's persistent allowlist.
 * Only the configured bot owner can use this command.
 *
 * Usage:
 *   .allowuser 123456789012345678
 */

'use strict';

const { isOwner, denyAccess } = require('../../utils/permissions');
const { addUser } = require('../../utils/allowlist');

module.exports = {
  name: 'allowuser',
  description: 'Adds a user to the bot allowlist. Owner only.',
  usage: '.allowuser <user_id>',
  ownerOnly: true,

  async execute(message, args, client) {
    if (!isOwner(message)) {
      return denyAccess(message, 'Only the bot owner can manage the allowlist.');
    }

    const userId = args[0];

    if (!userId || !/^\d{17,20}$/.test(userId)) {
      return message.reply(
        '**Usage:** `.allowuser <user_id>`\n' +
        'Provide a valid Discord user ID (17–20 digits).'
      );
    }

    const added = addUser(userId);

    if (!added) {
      return message.reply(`**User \`${userId}\` is already on the allowlist.**`);
    }

    return message.reply(
      `**User \`${userId}\` added to the allowlist.**\n` +
      `They can now use all archive commands in any server.`
    );
  },
};
