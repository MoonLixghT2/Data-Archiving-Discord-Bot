/**
 * Event Handler
 *
 * Scans src/events/ for event modules and registers them on the Discord client.
 * Each event module exports: { name, once?, execute(client, ...args) }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const EVENTS_DIR = path.join(__dirname, '../events');

/**
 * Loads all event modules and attaches them to the client.
 * @param {import('discord.js').Client} client
 */
async function loadEvents(client) {
  const files = fs
    .readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.js'));

  let count = 0;

  for (const file of files) {
    try {
      const event = require(path.join(EVENTS_DIR, file));

      if (!event.name || typeof event.execute !== 'function') {
        logger.warn(`Event file ${file} is missing required "name" or "execute" export.`);
        continue;
      }

      if (event.once) {
        client.once(event.name, (...args) => event.execute(client, ...args));
      } else {
        client.on(event.name, (...args) => event.execute(client, ...args));
      }

      count++;
    } catch (error) {
      logger.error(`Failed to load event ${file}: ${error.message}`, { stack: error.stack });
    }
  }

  logger.info(`Registered ${count} event listeners.`);
}

module.exports = { loadEvents };
