/**
 * Storage Service
 *
 * Provides disk usage statistics for the data directory,
 * and handles safe cache purging without deleting archived data.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getStoragePath, getConfig } = require('../utils/config');
const { getDirSize, formatBytes, getCachePath } = require('../utils/helpers');
const { getDb } = require('../database/database');
const logger = require('../utils/logger');

const cfg = getConfig();

/**
 * Returns a full disk usage breakdown of the data directory.
 * @param {string} guildId - Optional: if provided, scopes to one guild
 * @returns {object}
 */
function getStorageStats(guildId) {
  const storagePath = getStoragePath();
  const basePath = guildId
    ? path.join(storagePath, 'servers', guildId)
    : storagePath;

  if (!fs.existsSync(basePath)) {
    return { total: 0, attachments: 0, voice: 0, exports: 0, backups: 0, cache: 0, db: 0 };
  }

  const attachmentsPath = guildId
    ? path.join(basePath, 'channels')
    : path.join(storagePath, 'servers');

  const voicePath = guildId
    ? path.join(basePath, 'voice')
    : path.join(storagePath, 'servers');

  const exportsPath = guildId
    ? path.join(basePath, 'exports')
    : path.join(storagePath, 'servers');

  const backupsPath = path.join(storagePath, 'backups');
  const cachePath = getCachePath();
  const dbPath = path.join(storagePath, 'archiver.db');

  const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
  const cacheSize = getDirSize(cachePath);
  const backupSize = getDirSize(backupsPath);
  const totalSize = getDirSize(storagePath);

  return {
    total: totalSize,
    db: dbSize,
    cache: cacheSize,
    backups: backupSize,
    servers: getDirSize(path.join(storagePath, 'servers')),
    formatted: {
      total: formatBytes(totalSize),
      db: formatBytes(dbSize),
      cache: formatBytes(cacheSize),
      backups: formatBytes(backupSize),
    },
  };
}

/**
 * Retrieves archival statistics from the database.
 * @param {string} guildId
 * @returns {object}
 */
function getArchiveStats(guildId) {
  const db = getDb();

  const msgRow = db.prepare(
    'SELECT COUNT(*) as count FROM messages WHERE guild_id = ?'
  ).get(guildId);

  const attRow = db.prepare(
    'SELECT COUNT(*) as count FROM attachments WHERE guild_id = ?'
  ).get(guildId);

  const trackedRow = db.prepare(
    'SELECT COUNT(*) as count FROM tracked_channels WHERE guild_id = ? AND enabled = 1'
  ).get(guildId);

  const voiceRow = db.prepare(
    'SELECT COUNT(*) as count FROM voice_sessions WHERE guild_id = ?'
  ).get(guildId);

  const deletedRow = db.prepare(
    'SELECT COUNT(*) as count FROM messages WHERE guild_id = ? AND is_deleted = 1'
  ).get(guildId);

  return {
    messages: msgRow?.count || 0,
    attachments: attRow?.count || 0,
    trackedChannels: trackedRow?.count || 0,
    voiceSessions: voiceRow?.count || 0,
    deletedMessages: deletedRow?.count || 0,
  };
}

/**
 * Safely removes all files from the cache directory.
 * Does NOT touch the servers/, backups/, or database directories.
 * @returns {{ deletedFiles: number, freedBytes: number }}
 */
function purgeCache() {
  const cachePath = getCachePath();
  const beforeSize = getDirSize(cachePath);
  let deletedFiles = 0;

  if (!fs.existsSync(cachePath)) {
    return { deletedFiles: 0, freedBytes: 0 };
  }

  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        try { fs.rmdirSync(full); } catch { /* not empty */ }
      } else {
        try {
          fs.unlinkSync(full);
          deletedFiles++;
        } catch (err) {
          logger.warn(`Failed to delete cache file ${full}: ${err.message}`);
        }
      }
    }
  };

  walk(cachePath);

  const afterSize = getDirSize(cachePath);
  const freedBytes = Math.max(0, beforeSize - afterSize);

  logger.info(`Cache purge complete: ${deletedFiles} files removed, ${formatBytes(freedBytes)} freed.`);
  return { deletedFiles, freedBytes };
}

module.exports = { getStorageStats, getArchiveStats, purgeCache };
