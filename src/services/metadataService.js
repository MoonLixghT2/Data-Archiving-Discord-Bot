/**
 * Metadata Service
 *
 * Writes per-channel metadata.json files and per-guild server-metadata.json.
 * Called during scraping to preserve channel and server context alongside archived data.
 *
 * metadata.json schema per channel:
 * {
 *   channel_id, channel_name, channel_type, topic, guild_id, guild_name,
 *   position, created_at, scraped_at, nsfw, parent_id, parent_name
 * }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getChannelPath, getGuildPath } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Writes metadata.json for a specific text channel.
 * Overwrites any existing file (metadata may update between scrapes).
 *
 * @param {import('discord.js').TextChannel} channel
 */
function writeChannelMetadata(channel) {
  try {
    const dir = getChannelPath(channel.guildId, channel.id, channel.name);
    const filePath = path.join(dir, 'metadata.json');

    const parent = channel.parent;

    const metadata = {
      channel_id:   channel.id,
      channel_name: channel.name,
      channel_type: channel.type,
      topic:        channel.topic || null,
      nsfw:         channel.nsfw || false,
      position:     channel.position,
      parent_id:    parent?.id || null,
      parent_name:  parent?.name || null,
      guild_id:     channel.guild.id,
      guild_name:   channel.guild.name,
      created_at:   channel.createdAt?.toISOString() || null,
      scraped_at:   new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');
  } catch (error) {
    logger.warn(`Failed to write channel metadata for ${channel.id}: ${error.message}`);
  }
}

/**
 * Writes server-metadata.json for the guild.
 * Saved at the root of the guild's storage directory.
 *
 * @param {import('discord.js').Guild} guild
 */
function writeGuildMetadata(guild) {
  try {
    const dir = getGuildPath(guild.id);
    const filePath = path.join(dir, 'server-metadata.json');

    const metadata = {
      guild_id:             guild.id,
      guild_name:           guild.name,
      description:          guild.description || null,
      member_count:         guild.memberCount,
      owner_id:             guild.ownerId,
      created_at:           guild.createdAt?.toISOString() || null,
      premium_tier:         guild.premiumTier,
      premium_subs:         guild.premiumSubscriptionCount || 0,
      verification_level:   guild.verificationLevel,
      text_channel_count:   guild.channels.cache.filter((c) => c.type === 0).size,
      voice_channel_count:  guild.channels.cache.filter((c) => c.type === 2).size,
      role_count:           guild.roles.cache.size - 1,
      emoji_count:          guild.emojis.cache.size,
      icon_url:             guild.iconURL({ size: 512 }) || null,
      archived_at:          new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');
  } catch (error) {
    logger.warn(`Failed to write guild metadata for ${guild.id}: ${error.message}`);
  }
}

module.exports = { writeChannelMetadata, writeGuildMetadata };
