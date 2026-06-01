/**
 * Config Utility
 *
 * Loads config/config.json and merges owner ID and storage paths
 * from environment variables for runtime override support.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../../config/config.json');

let _config = null;

/**
 * Returns the merged bot configuration object.
 * Cached after first load.
 * @returns {object}
 */
function getConfig() {
  if (_config) return _config;

  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`config.json not found at ${CONFIG_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  // Environment variable overrides
  if (process.env.OWNER_ID) raw.ownerID = process.env.OWNER_ID;
  if (process.env.STORAGE_PATH) raw.storagePath = process.env.STORAGE_PATH;
  if (process.env.LOG_PATH) raw.logPath = process.env.LOG_PATH;

  // Resolve storage and log paths to absolute
  raw.storagePath = path.resolve(raw.storagePath || './data');
  raw.logPath = path.resolve(raw.logPath || './logs');

  _config = raw;
  return _config;
}

/**
 * Returns the configured command prefix.
 * @returns {string}
 */
function getPrefix() {
  return getConfig().prefix || '.';
}

/**
 * Returns the owner's Discord user ID.
 * @returns {string}
 */
function getOwnerID() {
  return getConfig().ownerID || process.env.OWNER_ID || '';
}

/**
 * Returns the absolute path to the data storage directory.
 * @returns {string}
 */
function getStoragePath() {
  return getConfig().storagePath;
}

module.exports = { getConfig, getPrefix, getOwnerID, getStoragePath };
