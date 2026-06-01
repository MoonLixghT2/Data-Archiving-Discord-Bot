/**
 * Discord Archiver Bot — Entry Point
 *
 * Bootstraps the client, loads all handlers, and connects to Discord.
 */

'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { initDatabase } = require('./src/database/database');
const { loadCommands } = require('./src/handlers/commandHandler');
const { loadEvents } = require('./src/handlers/eventHandler');
const { initPlayDl } = require('./src/scripts/initPlayDl');
const logger = require('./src/utils/logger');

// --- Validate required environment variables ---
const REQUIRED_ENV = ['BOT_TOKEN', 'CLIENT_ID', 'OWNER_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.error(`Missing required environment variable: ${key}. Check your .env file.`);
    process.exit(1);
  }
}

// --- Client Initialization ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ],
});

// --- Shared Client State ---

/** @type {Collection<string, object>} Prefix commands keyed by name */
client.commands = new Collection();

/** @type {Collection<string, object>} Slash commands keyed by name */
client.slashCommands = new Collection();

/** @type {Map<string, Set<string>>} guildId => Set of tracked channelIds */
client.activeTracking = new Map();

/** @type {Map<string, Set<string>>} guildId => Set of ignored channelIds */
client.ignoredChannels = new Map();

/** @type {Map<string, object>} guildId => MusicQueue instance */
client.musicQueues = new Map();

/** @type {Map<string, object>} guildId => VoiceSession instance */
client.voiceSessions = new Map();

// --- Boot Sequence ---
(async () => {
  try {
    logger.info('Initializing database...');
    await initDatabase(client);

    logger.info('Initializing play-dl (music)...');
    await initPlayDl();

    logger.info('Loading commands...');
    await loadCommands(client);

    logger.info('Loading events...');
    await loadEvents(client);

    logger.info('Connecting to Discord...');
    await client.login(process.env.BOT_TOKEN);
  } catch (error) {
    logger.error(`Fatal startup error: ${error.message}`, { stack: error.stack });
    process.exit(1);
  }
})();

// --- Global Error Handlers ---
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Promise Rejection: ${reason}`);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
  process.exit(1);
});

// --- Graceful Shutdown ---
const shutdown = async (signal) => {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);
  try {
    for (const [guildId, session] of client.voiceSessions) {
      if (session?.connection) {
        session.connection.destroy();
        logger.info(`Closed voice session for guild ${guildId}`);
      }
    }
    for (const [guildId, queue] of client.musicQueues) {
      if (queue?.connection) {
        queue.connection.destroy();
        logger.info(`Closed music connection for guild ${guildId}`);
      }
    }
    client.destroy();
    logger.info('Bot shut down cleanly.');
    process.exit(0);
  } catch (err) {
    logger.error(`Error during shutdown: ${err.message}`);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
