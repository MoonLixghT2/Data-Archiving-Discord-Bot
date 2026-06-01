/**
 * Event: messageUpdate
 *
 * Fires when a message is edited.
 * Updates the archived record and appends an edit log entry
 * if the message is in a tracked, non-ignored channel.
 */

'use strict';

const { updateMessage } = require('../services/archiverService');
const { getChannelPath } = require('../utils/helpers');
const { getDb } = require('../database/database');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'messageUpdate',

  async execute(client, oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (!newMessage.content || oldMessage.content === newMessage.content) return;

    const guildTracking = client.activeTracking.get(newMessage.guildId);
    const guildIgnored  = client.ignoredChannels.get(newMessage.guildId);
    const isIgnored     = guildIgnored?.has(newMessage.channelId);
    const isTracked     =
      guildTracking?.has(newMessage.channelId) ||
      guildTracking?.has('*');

    if (!isTracked || isIgnored) return;

    try {
      // Ensure the message exists in DB before trying to update
      const db = getDb();
      const existing = db.prepare(
        'SELECT id FROM messages WHERE message_id = ?'
      ).get(newMessage.id);

      if (!existing) return; // Not archived yet — skip

      updateMessage(newMessage);

      // Append an edit note to the TXT log
      const channelName = newMessage.channel?.name;
      const dir = getChannelPath(newMessage.guildId, newMessage.channelId, channelName);
      const logPath = path.join(dir, 'messages.txt');
      const ts = new Date().toISOString();
      const line =
        `[${ts}] [EDIT] ${newMessage.author.username} (${newMessage.id}): ` +
        `"${oldMessage.content || ''}" -> "${newMessage.content}"\n`;

      fs.appendFileSync(logPath, line, 'utf8');
    } catch (error) {
      logger.error(`messageUpdate handler error: ${error.message}`);
    }
  },
};
