/**
 * Command Handler
 *
 * Recursively scans src/commands/ for command modules.
 * - Prefix commands (non-music folders) are registered to client.commands
 * - Slash commands (music/ folder) are registered to client.slashCommands
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const COMMANDS_DIR = path.join(__dirname, '../commands');

/**
 * Loads all command modules and populates client.commands and client.slashCommands.
 * @param {import('discord.js').Client} client
 */
async function loadCommands(client) {
  const categories = fs.readdirSync(COMMANDS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let prefixCount = 0;
  let slashCount = 0;

  for (const category of categories) {
    const categoryPath = path.join(COMMANDS_DIR, category);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith('.js'));

    for (const file of files) {
      try {
        const mod = require(path.join(categoryPath, file));

        /**
         * A module can export:
         *   A) A single command object (module.exports = { name/data, execute })
         *   B) Multiple named commands (module.exports.skip = { data, execute }, ...)
         *      Used by music/controls.js to group related slash commands.
         */
        const candidates =
          mod.data || mod.name
            ? [mod]                           // Pattern A — single export
            : Object.values(mod).filter(      // Pattern B — named exports
                (v) => v && (v.data || v.name) && typeof v.execute === 'function'
              );

        for (const command of candidates) {
          if (command.data && typeof command.execute === 'function') {
            client.slashCommands.set(command.data.name, command);
            slashCount++;
          } else if (command.name && typeof command.execute === 'function') {
            client.commands.set(command.name, command);
            if (Array.isArray(command.aliases)) {
              for (const alias of command.aliases) {
                client.commands.set(alias, command);
              }
            }
            prefixCount++;
          }
        }

        if (candidates.length === 0) {
          logger.warn(`Command file ${file} in category ${category} has no valid export structure.`);
        }
      } catch (error) {
        logger.error(`Failed to load command ${file}: ${error.message}`, { stack: error.stack });
      }
    }
  }

  logger.info(`Loaded ${prefixCount} prefix commands and ${slashCount} slash commands.`);
}

module.exports = { loadCommands };
