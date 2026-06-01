/**
 * Allowlist Manager
 *
 * Handles persistent storage and runtime management of the bot user allowlist.
 * The allowlist is stored in config/allowlist.json and reloaded on demand.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ALLOWLIST_PATH = path.resolve(__dirname, '../../config/allowlist.json');

/**
 * Reads the allowlist from disk.
 * @returns {{ users: string[] }}
 */
function readAllowlist() {
  try {
    if (!fs.existsSync(ALLOWLIST_PATH)) {
      return { users: [] };
    }
    return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch {
    return { users: [] };
  }
}

/**
 * Writes the allowlist object to disk.
 * @param {{ users: string[] }} data
 */
function writeAllowlist(data) {
  fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Returns the full list of allowed user IDs.
 * @returns {string[]}
 */
function getAllowedUsers() {
  return readAllowlist().users;
}

/**
 * Checks whether a user ID is on the allowlist.
 * @param {string} userId
 * @returns {boolean}
 */
function isAllowed(userId) {
  return readAllowlist().users.includes(userId);
}

/**
 * Adds a user ID to the allowlist.
 * Returns false if the user is already listed.
 * @param {string} userId
 * @returns {boolean}
 */
function addUser(userId) {
  const data = readAllowlist();
  if (data.users.includes(userId)) return false;
  data.users.push(userId);
  writeAllowlist(data);
  return true;
}

/**
 * Removes a user ID from the allowlist.
 * Returns false if the user was not listed.
 * @param {string} userId
 * @returns {boolean}
 */
function removeUser(userId) {
  const data = readAllowlist();
  const index = data.users.indexOf(userId);
  if (index === -1) return false;
  data.users.splice(index, 1);
  writeAllowlist(data);
  return true;
}

module.exports = { getAllowedUsers, isAllowed, addUser, removeUser };
