/**
 * Event: messageDelete
 *
 * Fires when a message is deleted.
 * Marks the archived record as deleted and appends a deletion log entry.
 * Only acts on tracked, non-ignored channels.
 */

'use strict';

const { markDeleted } = require('../services/archiverService');
const { getChannelPath } = require('../utils/helpers');
const { getDb } = require('../database/database');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'messageDelete',

  async execute(client, message) {
    // Partial messages have limited data — still attempt to mark deleted
    if (!message.guildId) return;

    const guildTracking = client.activeTracking.get(message.guildId);
    const guildIgnored  = client.ignoredChannels.get(message.guildId);
    const isIgnored     = guildIgnored?.has(message.channelId);
    const isTracked     =
      guildTracking?.has(message.channelId) ||
      guildTracking?.has('*');

    if (!isTracked || isIgnored) return;

    try {
      const db = getDb();
      const existing = db.prepare(
        'SELECT id FROM messages WHERE message_id = ?'
      ).get(message.id);

      if (!existing) return;

      markDeleted(message.id);

      const channelName = message.channel?.name;
      const dir = getChannelPath(message.guildId, message.channelId, channelName);
      const logPath = path.join(dir, 'messages.txt');
      const ts = new Date().toISOString();
      const author = message.author?.username || 'Unknown';
      const content = message.content || '(content unavailable — partial message)';
      const line = `[${ts}] [DELETED] ${author} (${message.id}): "${content}"\n`;

      fs.appendFileSync(logPath, line, 'utf8');
    } catch (error) {
      logger.error(`messageDelete handler error: ${error.message}`);
    }
  },
};
