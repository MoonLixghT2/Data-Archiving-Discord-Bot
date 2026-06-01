/**
 * Database Module
 *
 * Initializes the SQLite database via better-sqlite3,
 * applies the full schema, and loads persistent tracking state
 * into client memory maps on startup.
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { getStoragePath } = require('../utils/config');
const logger = require('../utils/logger');

let db = null;

/**
 * Returns the shared database instance.
 * Throws if initDatabase() has not been called yet.
 * @returns {Database.Database}
 */
function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

/**
 * Initializes the SQLite database, applies schema, and seeds client state.
 * @param {import('discord.js').Client} client
 */
async function initDatabase(client) {
  const storagePath = getStoragePath();
  fs.mkdirSync(storagePath, { recursive: true });

  const dbPath = path.join(storagePath, 'archiver.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  applySchema();
  logger.info(`Database initialized at ${dbPath}`);

  // Restore tracking state into client memory
  if (client) {
    restoreTrackingState(client);
  }
}

/**
 * Applies the full database schema (idempotent via CREATE TABLE IF NOT EXISTS).
 */
function applySchema() {
  db.exec(`
    -- Archived message records
    CREATE TABLE IF NOT EXISTS messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id        TEXT NOT NULL,
      channel_id      TEXT NOT NULL,
      message_id      TEXT NOT NULL UNIQUE,
      author_id       TEXT NOT NULL,
      author_username TEXT NOT NULL,
      author_tag      TEXT,
      content         TEXT,
      embeds_json     TEXT,
      attachments_json TEXT,
      reactions_json  TEXT,
      stickers_json   TEXT,
      thread_id       TEXT,
      reply_to_id     TEXT,
      timestamp       TEXT NOT NULL,
      edited_timestamp TEXT,
      is_deleted      INTEGER NOT NULL DEFAULT 0,
      archived_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_guild    ON messages(guild_id);
    CREATE INDEX IF NOT EXISTS idx_messages_channel  ON messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_messages_author   ON messages(author_id);
    CREATE INDEX IF NOT EXISTS idx_messages_ts       ON messages(timestamp);

    -- Downloaded attachment records
    CREATE TABLE IF NOT EXISTS attachments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id    TEXT NOT NULL,
      guild_id      TEXT NOT NULL,
      channel_id    TEXT NOT NULL,
      attachment_id TEXT NOT NULL UNIQUE,
      filename      TEXT NOT NULL,
      content_type  TEXT,
      size_bytes    INTEGER,
      url           TEXT NOT NULL,
      local_path    TEXT,
      file_hash     TEXT,
      downloaded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_hash    ON attachments(file_hash);

    -- Per-channel real-time tracking status
    CREATE TABLE IF NOT EXISTS tracked_channels (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      enabled    INTEGER NOT NULL DEFAULT 1,
      added_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(guild_id, channel_id)
    );

    -- Per-channel ignore list for real-time tracking
    CREATE TABLE IF NOT EXISTS ignored_channels (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      added_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(guild_id, channel_id)
    );

    -- Scrape progress for resume support
    CREATE TABLE IF NOT EXISTS scrape_progress (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id        TEXT NOT NULL,
      channel_id      TEXT NOT NULL,
      last_message_id TEXT,
      status          TEXT NOT NULL DEFAULT 'pending',
      started_at      TEXT,
      finished_at     TEXT,
      messages_count  INTEGER NOT NULL DEFAULT 0,
      UNIQUE(guild_id, channel_id)
    );

    -- Voice session records
    CREATE TABLE IF NOT EXISTS voice_sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id      TEXT NOT NULL,
      channel_id    TEXT NOT NULL,
      channel_name  TEXT,
      started_at    TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at      TEXT,
      file_paths    TEXT,
      participants  TEXT
    );
  `);
}

/**
 * Restores tracked and ignored channel sets from the DB into client memory maps.
 * @param {import('discord.js').Client} client
 */
function restoreTrackingState(client) {
  const tracked = db.prepare(
    "SELECT guild_id, channel_id FROM tracked_channels WHERE enabled = 1"
  ).all();

  for (const row of tracked) {
    if (!client.activeTracking.has(row.guild_id)) {
      client.activeTracking.set(row.guild_id, new Set());
    }
    client.activeTracking.get(row.guild_id).add(row.channel_id);
  }

  const ignored = db.prepare(
    "SELECT guild_id, channel_id FROM ignored_channels"
  ).all();

  for (const row of ignored) {
    if (!client.ignoredChannels.has(row.guild_id)) {
      client.ignoredChannels.set(row.guild_id, new Set());
    }
    client.ignoredChannels.get(row.guild_id).add(row.channel_id);
  }

  logger.info(
    `Restored ${tracked.length} tracked channels and ${ignored.length} ignored channels from database.`
  );
}

module.exports = { initDatabase, getDb };
