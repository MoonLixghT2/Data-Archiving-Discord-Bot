/**
 * Play-DL Initialization
 *
 * Configures play-dl with Spotify credentials (if provided).
 * Called once during bot startup before any music commands run.
 */

'use strict';

const play = require('play-dl');
const logger = require('../utils/logger');

/**
 * Initializes play-dl with Spotify credentials from environment variables.
 * Silently skips if credentials are not configured.
 */
async function initPlayDl() {
  const clientId     = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (clientId && clientSecret) {
    try {
      await play.setToken({
        spotify: {
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: '',
          market: 'US',
        },
      });
      logger.info('play-dl: Spotify credentials configured.');
    } catch (error) {
      logger.warn(`play-dl: Failed to set Spotify credentials: ${error.message}. Spotify URLs will not be supported.`);
    }
  } else {
    logger.info('play-dl: No Spotify credentials found. Spotify URLs will not be supported.');
  }
}

module.exports = { initPlayDl };
