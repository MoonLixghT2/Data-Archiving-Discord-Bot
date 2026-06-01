/**
 * Command: .removeallowuser
 *
 * Removes a Discord user ID from the bot's persistent allowlist.
 * Only the configured bot owner can use this command.
 *
 * Usage:
 *   .removeallowuser 123456789012345678
 */

'use strict';

const { isOwner, denyAccess } = require('../../utils/permissions');
const { removeUser } = require('../../utils/allowlist');

module.exports = {
  name: 'removeallowuser',
  description: 'Removes a user from the bot allowlist. Owner only.',
  usage: '.removeallowuser <user_id>',
  ownerOnly: true,

  async execute(message, args, client) {
    if (!isOwner(message)) {
      return denyAccess(message, 'Only the bot owner can manage the allowlist.');
    }

    const userId = args[0];

    if (!userId || !/^\d{17,20}$/.test(userId)) {
      return message.reply(
        '**Usage:** `.removeallowuser <user_id>`\n' +
        'Provide a valid Discord user ID (17–20 digits).'
      );
    }

    const removed = removeUser(userId);

    if (!removed) {
      return message.reply(`**User \`${userId}\` is not on the allowlist.**`);
    }

    return message.reply(
      `**User \`${userId}\` removed from the allowlist.**\n` +
      `They can no longer use archive commands.`
    );
  },
};
