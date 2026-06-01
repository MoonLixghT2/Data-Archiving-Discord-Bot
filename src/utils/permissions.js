/**
 * Permissions Utility
 *
 * Centralizes all access control checks for prefix commands.
 * - Public commands: no check required
 * - Allowlist commands: user must be in allowlist OR be the owner
 * - Owner-only commands: user must be the configured owner ID
 */

'use strict';

const { getOwnerID } = require('./config');
const { isAllowed } = require('./allowlist');

/**
 * Checks whether a message author is the configured bot owner.
 * @param {import('discord.js').Message} message
 * @returns {boolean}
 */
function isOwner(message) {
  return message.author.id === getOwnerID();
}

/**
 * Checks whether a message author is allowlisted (or the owner).
 * @param {import('discord.js').Message} message
 * @returns {boolean}
 */
function isAllowlisted(message) {
  return isOwner(message) || isAllowed(message.author.id);
}

/**
 * Sends a standardized "Access Denied" reply.
 * @param {import('discord.js').Message} message
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
async function denyAccess(message, reason = 'You are not authorized to use this command.') {
  await message.reply(`**Access Denied** — ${reason}`);
}

module.exports = { isOwner, isAllowlisted, denyAccess };
