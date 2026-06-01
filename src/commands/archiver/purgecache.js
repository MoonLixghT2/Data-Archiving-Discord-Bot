/**
 * Command: .purgecache
 *
 * Safely clears all temporary files from the cache directory.
 * Does NOT delete any archived messages, attachments, voice recordings,
 * database records, exports, or backups.
 */

'use strict';

const { isAllowlisted, denyAccess } = require('../../utils/permissions');
const { purgeCache } = require('../../services/storageService');
const { formatBytes } = require('../../utils/helpers');
const logger = require('../../utils/logger');

module.exports = {
  name: 'purgecache',
  description: 'Clears temporary cache files. Does NOT delete archived data.',
  usage: '.purgecache',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);

    const statusMsg = await message.reply('**Purging cache...**');

    try {
      const { deletedFiles, freedBytes } = purgeCache();

      logger.info(
        `Cache purge by ${message.author.tag}: ${deletedFiles} file(s) removed, ${formatBytes(freedBytes)} freed.`
      );

      await statusMsg.edit(
        `**Cache purge complete.**\n` +
        `- Files removed: ${deletedFiles}\n` +
        `- Space freed: ${formatBytes(freedBytes)}\n` +
        `- Archived data was not affected.`
      );
    } catch (error) {
      logger.error(`Cache purge failed: ${error.message}`);
      await statusMsg.edit(`**Cache purge failed:** ${error.message}`);
    }
  },
};
