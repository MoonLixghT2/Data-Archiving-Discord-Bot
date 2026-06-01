/**
 * Search Service
 *
 * Performs keyword and filtered searches against the archived message database.
 * Supports filtering by user, channel, and date range with pagination.
 */

'use strict';

const { getDb } = require('../database/database');
const { getConfig } = require('../utils/config');

const cfg = getConfig();
const PAGE_SIZE = cfg.pagination?.searchResultsPerPage || 10;

/**
 * Searches archived messages with optional filters.
 *
 * @param {{
 *   guildId: string,
 *   keyword?: string,
 *   userId?: string,
 *   channelId?: string,
 *   before?: string,   // ISO date string
 *   after?: string,    // ISO date string
 *   page?: number      // 1-indexed
 * }} options
 * @returns {{ results: object[], total: number, page: number, totalPages: number }}
 */
function searchMessages(options) {
  const {
    guildId,
    keyword,
    userId,
    channelId,
    before,
    after,
    page = 1,
  } = options;

  const conditions = ['guild_id = ?'];
  const params = [guildId];

  if (keyword) {
    conditions.push('content LIKE ?');
    params.push(`%${keyword}%`);
  }

  if (userId) {
    conditions.push('author_id = ?');
    params.push(userId);
  }

  if (channelId) {
    conditions.push('channel_id = ?');
    params.push(channelId);
  }

  if (after) {
    conditions.push('timestamp >= ?');
    params.push(after);
  }

  if (before) {
    conditions.push('timestamp <= ?');
    params.push(before);
  }

  const whereClause = conditions.join(' AND ');
  const db = getDb();

  const totalRow = db.prepare(
    `SELECT COUNT(*) as count FROM messages WHERE ${whereClause}`
  ).get(...params);

  const total = totalRow?.count || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;

  const results = db.prepare(
    `SELECT message_id, channel_id, author_username, content, timestamp, is_deleted, edited_timestamp
     FROM messages
     WHERE ${whereClause}
     ORDER BY timestamp DESC
     LIMIT ? OFFSET ?`
  ).all(...params, PAGE_SIZE, offset);

  return {
    results,
    total,
    page: Math.max(1, page),
    totalPages,
  };
}

/**
 * Highlights keyword occurrences in a string using markdown bold.
 * @param {string} text
 * @param {string} keyword
 * @returns {string}
 */
function highlightKeyword(text, keyword) {
  if (!text || !keyword) return text || '';
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), (match) => `**${match}**`);
}

module.exports = { searchMessages, highlightKeyword, PAGE_SIZE };
