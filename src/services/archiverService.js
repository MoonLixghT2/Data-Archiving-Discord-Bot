/**
 * Archiver Service
 *
 * Handles storing Discord messages to:
 *   - SQLite database (indexed, searchable)
 *   - Plain TXT log files (human readable)
 *   - JSONL files (machine readable, one JSON object per line)
 *
 * Also handles bulk channel scraping with pagination and resume support.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('../database/database');
const { getChannelPath, formatMessageLine, sleep } = require('../utils/helpers');
const { downloadMessageAttachments } = require('./downloadService');
const { writeChannelMetadata } = require('./metadataService');
const { getConfig } = require('../utils/config');
const logger = require('../utils/logger');

const cfg = getConfig();

// ─── Message Serialization ────────────────────────────────────────────────────

/**
 * Converts a Discord.js Message into a plain data object for storage.
 * @param {import('discord.js').Message} message
 * @returns {object}
 */
function serializeMessage(message) {
  return {
    message_id: message.id,
    guild_id: message.guildId,
    channel_id: message.channelId,
    author_id: message.author?.id || 'unknown',
    author_username: message.author?.username || 'unknown',
    author_tag: message.author?.tag || null,
    content: message.content || '',
    embeds_json: JSON.stringify(message.embeds?.map((e) => e.toJSON()) || []),
    attachments_json: JSON.stringify(
      [...(message.attachments?.values() || [])].map((a) => ({
        id: a.id,
        url: a.url,
        name: a.name,
        contentType: a.contentType,
        size: a.size,
      }))
    ),
    reactions_json: JSON.stringify(
      [...(message.reactions?.cache?.values() || [])].map((r) => ({
        emoji: r.emoji.name,
        count: r.count,
      }))
    ),
    stickers_json: JSON.stringify(
      [...(message.stickers?.values() || [])].map((s) => ({
        id: s.id,
        name: s.name,
      }))
    ),
    thread_id: message.thread?.id || null,
    reply_to_id: message.reference?.messageId || null,
    timestamp: message.createdAt.toISOString(),
    edited_timestamp: message.editedAt?.toISOString() || null,
    is_deleted: 0,
  };
}

// ─── Database Operations ──────────────────────────────────────────────────────

/**
 * Inserts a message record into the database.
 * Silently ignores duplicates (UNIQUE constraint on message_id).
 * @param {object} data - Serialized message data
 * @returns {boolean} true if inserted, false if duplicate
 */
function insertMessage(data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT OR IGNORE INTO messages
      (guild_id, channel_id, message_id, author_id, author_username, author_tag,
       content, embeds_json, attachments_json, reactions_json, stickers_json,
       thread_id, reply_to_id, timestamp, edited_timestamp, is_deleted)
    VALUES
      (@guild_id, @channel_id, @message_id, @author_id, @author_username, @author_tag,
       @content, @embeds_json, @attachments_json, @reactions_json, @stickers_json,
       @thread_id, @reply_to_id, @timestamp, @edited_timestamp, @is_deleted)
  `).run(data);
  return result.changes > 0;
}

/**
 * Marks a message as deleted in the database.
 * @param {string} messageId
 */
function markDeleted(messageId) {
  const db = getDb();
  db.prepare(
    'UPDATE messages SET is_deleted = 1 WHERE message_id = ?'
  ).run(messageId);
}

/**
 * Updates a message's content and edited_timestamp in the database.
 * @param {import('discord.js').Message} message
 */
function updateMessage(message) {
  const db = getDb();
  db.prepare(`
    UPDATE messages
    SET content = ?, edited_timestamp = ?
    WHERE message_id = ?
  `).run(
    message.content || '',
    message.editedAt?.toISOString() || null,
    message.id
  );
}

// ─── File Log Writers ─────────────────────────────────────────────────────────

/**
 * Appends a message line to the channel's plain-text log.
 * @param {string} guildId
 * @param {string} channelId
 * @param {object} data - Serialized message data
 * @param {string} [channelName]
 */
function appendToTxtLog(guildId, channelId, data, channelName) {
  const dir = getChannelPath(guildId, channelId, channelName);
  const filePath = path.join(dir, 'messages.txt');
  const line = formatMessageLine(data) + '\n';
  fs.appendFileSync(filePath, line, 'utf8');
}

/**
 * Appends a message record to the channel's JSONL log.
 * @param {string} guildId
 * @param {string} channelId
 * @param {object} data - Serialized message data
 * @param {string} [channelName]
 */
function appendToJsonlLog(guildId, channelId, data, channelName) {
  const dir = getChannelPath(guildId, channelId, channelName);
  const filePath = path.join(dir, 'messages.jsonl');
  fs.appendFileSync(filePath, JSON.stringify(data) + '\n', 'utf8');
}

// ─── High-Level Archive Functions ─────────────────────────────────────────────

/**
 * Archives a single Discord message (DB + file logs).
 * Optionally downloads attachments.
 *
 * @param {import('discord.js').Message} message
 * @param {boolean} [downloadAttachments=false]
 * @returns {Promise<boolean>} true if newly archived, false if duplicate
 */
async function archiveMessage(message, downloadAttachments = false) {
  try {
    const data = serializeMessage(message);
    const inserted = insertMessage(data);
    const channelName = message.channel?.name;

    if (inserted) {
      appendToTxtLog(message.guildId, message.channelId, data, channelName);
      appendToJsonlLog(message.guildId, message.channelId, data, channelName);
    }

    if (downloadAttachments && message.attachments?.size > 0) {
      await downloadMessageAttachments(message);
    }

    return inserted;
  } catch (error) {
    logger.error(`Failed to archive message ${message.id}: ${error.message}`);
    return false;
  }
}

// ─── Channel Scraping ─────────────────────────────────────────────────────────

/**
 * Scrapes all historical messages from a channel.
 * Supports pagination (100 messages per batch), resume via scrape_progress table,
 * and optional attachment downloading.
 *
 * @param {import('discord.js').TextChannel} channel
 * @param {boolean} downloadAttachments
 * @param {Function} [onProgress] - Called with (archived, total) on each batch
 * @returns {Promise<number>} Total messages archived
 */
async function scrapeChannel(channel, downloadAttachments, onProgress) {
  const db = getDb();
  const { id: channelId, guildId } = channel;

  // Initialize or resume scrape progress
  let progress = db.prepare(
    'SELECT last_message_id, messages_count FROM scrape_progress WHERE guild_id = ? AND channel_id = ?'
  ).get(guildId, channelId);

  let lastMessageId = progress?.last_message_id || null;
  let totalArchived = progress?.messages_count || 0;

  // Upsert progress row
  db.prepare(`
    INSERT INTO scrape_progress (guild_id, channel_id, status, started_at)
    VALUES (?, ?, 'running', datetime('now'))
    ON CONFLICT(guild_id, channel_id) DO UPDATE SET status = 'running', started_at = datetime('now')
  `).run(guildId, channelId);

  logger.scrape.info(`Starting scrape of #${channel.name} (${channelId}) in guild ${guildId}. Resume from: ${lastMessageId || 'beginning'}`);

  // Write/refresh metadata.json for this channel
  writeChannelMetadata(channel);

  const batchDelay = cfg.scrape?.delayBetweenBatches || 1200;
  let batchCount = 0;

  while (true) {
    const fetchOptions = { limit: 100 };
    if (lastMessageId) fetchOptions.before = lastMessageId;

    let messages;
    try {
      messages = await channel.messages.fetch(fetchOptions);
    } catch (error) {
      logger.error(`Failed to fetch messages in #${channel.name}: ${error.message}`);
      break;
    }

    if (messages.size === 0) break;

    // Sort oldest first for consistent file log ordering
    const sorted = [...messages.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp
    );

    for (const message of sorted) {
      await archiveMessage(message, downloadAttachments);
      totalArchived++;
    }

    // Update last cursor (oldest message in batch = smallest ID)
    lastMessageId = sorted[0].id;
    batchCount++;

    // Persist progress
    db.prepare(`
      UPDATE scrape_progress
      SET last_message_id = ?, messages_count = ?
      WHERE guild_id = ? AND channel_id = ?
    `).run(lastMessageId, totalArchived, guildId, channelId);

    if (onProgress) onProgress(totalArchived, batchCount);

    logger.scrape.info(`#${channel.name}: batch ${batchCount}, ${totalArchived} total archived.`);

    // Respect rate limits
    await sleep(batchDelay);
  }

  // Mark complete
  db.prepare(`
    UPDATE scrape_progress
    SET status = 'completed', finished_at = datetime('now'), messages_count = ?
    WHERE guild_id = ? AND channel_id = ?
  `).run(totalArchived, guildId, channelId);

  logger.scrape.info(`Scrape complete: #${channel.name} — ${totalArchived} messages archived.`);
  return totalArchived;
}

module.exports = {
  archiveMessage,
  updateMessage,
  markDeleted,
  scrapeChannel,
  serializeMessage,
};
