/**
 * Command: .cmds
 *
 * Public command. Lists all bot commands with their descriptions,
 * usage syntax, and access requirements. Visible to everyone.
 *
 * Usage:
 *   .cmds
 */

'use strict';

const { EmbedBuilder } = require('discord.js');
const { isAllowlisted, denyAccess } = require('../../utils/permissions');

const COMMAND_REFERENCE = {
  'General (Public)': [
    { name: '.ping', desc: 'Roundtrip and WebSocket latency.' },
    { name: '.cmds', desc: 'Shows this command list.' },
  ],
  'Music (Public — slash commands)': [
    { name: '/play <query/url>', desc: 'Play from YouTube, Spotify, SoundCloud. Supports playlists and search.' },
    { name: '/skip', desc: 'Skip the current track.' },
    { name: '/stop', desc: 'Stop playback and clear the queue.' },
    { name: '/pause', desc: 'Pause current playback.' },
    { name: '/resume', desc: 'Resume paused playback.' },
    { name: '/queue', desc: 'View the current music queue.' },
    { name: '/nowplaying', desc: 'Detailed embed showing the current track.' },
    { name: '/clearqueue', desc: 'Wipe upcoming queue, keep current track playing.' },
  ],
  'Archiving (Allowlist only)': [
    { name: '.scrape [true|false] [channel]', desc: 'Scrape historical messages. true/false controls attachment downloading. Leave channel blank to scrape all.' },
    { name: '.channeltrack [channel]', desc: 'Enable real-time tracking for a channel. Leave blank to track all channels.' },
    { name: '.ignorechannel [channel]', desc: 'Disable tracking for a channel. Leave blank to stop all tracking.' },
    { name: '.export <format> [channel]', desc: 'Export archived data. Formats: txt, json, jsonl, csv, pdf. Leave channel blank for all.' },
    { name: '.search <keyword> [userID] [channel]', desc: 'Search archived messages. Supports --page N for pagination.' },
  ],
  'Voice (Allowlist only)': [
    { name: '.joinvc <channel>', desc: 'Join a voice channel and start recording. Each user gets a separate WAV file.' },
    { name: '.dc', desc: 'Disconnect from the active voice channel and save all recordings.' },
  ],
  'Statistics (Allowlist only)': [
    { name: '.stats', desc: 'Archive statistics: message counts, attachment counts, tracking status, storage.' },
    { name: '.storage', desc: 'Detailed disk usage breakdown by category and channel.' },
    { name: '.backup', desc: 'Create a full ZIP backup of all archived data and the database.' },
    { name: '.purgecache', desc: 'Clear temporary cache files. Does NOT remove archived data.' },
  ],
  'Access Control (Owner only)': [
    { name: '.allowuser <user_id>', desc: 'Add a user to the allowlist by their Discord user ID.' },
    { name: '.removeallowuser <user_id>', desc: 'Remove a user from the allowlist.' },
    { name: '.allowlist', desc: 'View all users currently on the allowlist.' },
    { name: '.serverinfo', desc: 'Member count, channels, boost level, owner, and creation date for this server.' },
    { name: '.announce <channel> <message>', desc: 'Send a formatted announcement embed to any channel.' },
  ],
};

module.exports = {
  name: 'cmds',
  description: 'Shows all commands and their descriptions. Allowlist only.',
  usage: '.cmds',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);
    const embeds = [];

    for (const [category, commands] of Object.entries(COMMAND_REFERENCE)) {
      const embed = new EmbedBuilder()
        .setTitle(category)
        .setColor(
          category.includes('Owner') ? 0xED4245 :
          category.includes('Allowlist') || category.includes('Voice') || category.includes('Statistics') ? 0xFEE75C :
          category.includes('Music') ? 0x57F287 :
          0x5865F2
        )
        .setDescription(
          commands.map((c) => `**${c.name}**\n${c.desc}`).join('\n\n')
        );

      embeds.push(embed);
    }

    // Discord allows max 10 embeds per message — split if needed
    for (let i = 0; i < embeds.length; i += 10) {
      await message.channel.send({ embeds: embeds.slice(i, i + 10) });
    }
  },
};
