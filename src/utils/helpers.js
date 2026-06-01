/**
 * General Helpers
 *
 * Shared utility functions for formatting, path construction,
 * date handling, and Discord-specific parsing.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { getStoragePath } = require('./config');

/**
 * Formats a byte count into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Formats a duration in milliseconds to HH:MM:SS or MM:SS.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Returns the storage path for a specific guild.
 * Creates directories if they do not exist.
 * @param {string} guildId
 * @returns {string}
 */
function getGuildPath(guildId) {
  const p = path.join(getStoragePath(), 'servers', guildId);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * Converts a raw channel name into a safe folder name.
 * Strips characters that are invalid on Windows/Linux/macOS filesystems
 * and collapses runs of underscores so names stay readable.
 * @param {string} name
 * @returns {string}
 */
function sanitizeChannelName(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // filesystem-unsafe chars
    .replace(/_+/g, '_')                      // collapse consecutive underscores
    .replace(/^_|_$/g, '')                    // strip leading/trailing underscores
    .slice(0, 100)                            // keep paths sane on all OSes
    || 'unknown-channel';
}

/**
 * Returns the storage path for a specific channel within a guild.
 * The folder is named after the channel name, not its ID.
 * Creates the full directory tree if it does not exist.
 * @param {string} guildId
 * @param {string} channelId   – still accepted so callers need no changes
 * @param {string} [channelName] – preferred; falls back to channelId if omitted
 * @returns {string}
 */
function getChannelPath(guildId, channelId, channelName) {
  const folderName = sanitizeChannelName(channelName || channelId);
  const p = path.join(getGuildPath(guildId), 'channels', folderName);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * Returns the attachments directory for a channel.
 * @param {string} guildId
 * @param {string} channelId
 * @param {'images'|'videos'|'files'} [subtype]
 * @param {string} [channelName]
 * @returns {string}
 */
function getAttachmentPath(guildId, channelId, subtype = 'files', channelName) {
  const p = path.join(getChannelPath(guildId, channelId, channelName), 'attachments', subtype);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * Returns the voice recordings directory for a guild/channel/date.
 * The folder is named after the channel name, not its ID.
 * @param {string} guildId
 * @param {string} channelId
 * @param {string} [channelName]
 * @returns {string}
 */
function getVoicePath(guildId, channelId, channelName) {
  const date = new Date().toISOString().slice(0, 10);
  const folderName = sanitizeChannelName(channelName || channelId);
  const p = path.join(getGuildPath(guildId), 'voice', folderName, date);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * Returns the exports directory for a guild.
 * @param {string} guildId
 * @returns {string}
 */
function getExportPath(guildId) {
  const p = path.join(getGuildPath(guildId), 'exports');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * Returns the backups directory.
 * @returns {string}
 */
function getBackupPath() {
  const p = path.join(getStoragePath(), 'backups');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * Returns the cache directory.
 * @returns {string}
 */
function getCachePath() {
  const p = path.join(getStoragePath(), 'cache');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * Sanitizes a filename by removing invalid characters.
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').slice(0, 200);
}

/**
 * Formats a Discord message into a plain-text log line.
 * @param {object} msg - Raw message data object (from DB or Discord API)
 * @returns {string}
 */
function formatMessageLine(msg) {
  const ts = msg.timestamp
    ? new Date(msg.timestamp).toISOString()
    : new Date().toISOString();
  const author = msg.author_username || msg.author?.username || 'Unknown';
  const content = msg.content || '';
  const deleted = msg.is_deleted ? ' [DELETED]' : '';
  const edited = msg.edited_timestamp ? ' [EDITED]' : '';
  return `[${ts}]${deleted}${edited} ${author}: ${content}`;
}

/**
 * Resolves a channel by name or ID from a guild.
 * Returns null if not found.
 * @param {import('discord.js').Guild} guild
 * @param {string} nameOrId
 * @returns {import('discord.js').GuildChannel|null}
 */
function resolveChannel(guild, nameOrId) {
  if (!nameOrId) return null;
  return (
    guild.channels.cache.get(nameOrId) ||
    guild.channels.cache.find(
      (c) => c.name.toLowerCase() === nameOrId.toLowerCase()
    ) ||
    null
  );
}

/**
 * Recursively calculates the total size of a directory in bytes.
 * @param {string} dirPath
 * @returns {number}
 */
function getDirSize(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(full);
    } else {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

/**
 * Sleeps for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines attachment subtype folder based on MIME type.
 * @param {string} contentType
 * @returns {'images'|'videos'|'files'}
 */
function getAttachmentSubtype(contentType) {
  if (!contentType) return 'files';
  if (contentType.startsWith('image/')) return 'images';
  if (contentType.startsWith('video/')) return 'videos';
  return 'files';
}

module.exports = {
  formatBytes,
  formatDuration,
  getStoragePath,   // re-exported for convenience so commands need only one import
  getGuildPath,
  getChannelPath,
  getAttachmentPath,
  getVoicePath,
  getExportPath,
  getBackupPath,
  getCachePath,
  sanitizeFilename,
  sanitizeChannelName,
  formatMessageLine,
  resolveChannel,
  getDirSize,
  sleep,
  getAttachmentSubtype,
};
