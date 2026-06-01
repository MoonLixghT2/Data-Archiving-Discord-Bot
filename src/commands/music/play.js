/**
 * Slash Command: /play
 *
 * Plays music from a YouTube URL, Spotify URL, SoundCloud URL, or search query.
 * Supports single tracks, playlists, and search-by-name. Public command.
 *
 * Usage:
 *   /play Never Gonna Give You Up
 *   /play https://youtube.com/watch?v=...
 *   /play https://open.spotify.com/playlist/...
 */

'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { resolveTracks, getQueue, MAX_QUEUE } = require('../../services/musicPlayer');
const { formatDuration } = require('../../utils/helpers');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play music from YouTube, Spotify, SoundCloud, or by search query.')
    .addStringOption((opt) =>
      opt
        .setName('query')
        .setDescription('Song name, search terms, or URL (YouTube/Spotify/SoundCloud)')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    await interaction.deferReply();

    const query = interaction.options.getString('query', true).trim();
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.editReply(
        '**You must be in a voice channel** to use this command.'
      );
    }

    const botPermissions = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!botPermissions?.has(['Connect', 'Speak'])) {
      return interaction.editReply(
        '**Permission Error:** I need **Connect** and **Speak** permissions in your voice channel.'
      );
    }

    try {
      const tracks = await resolveTracks(query);

      if (!tracks || tracks.length === 0) {
        return interaction.editReply('**No results found** for that query.');
      }

      const queue = getQueue(client, interaction.guildId);

      // Join voice if not already connected or if in a different channel
      if (!queue.connection || queue.connection.joinConfig?.channelId !== voiceChannel.id) {
        await queue.join(voiceChannel);
      }

      const availableSlots = MAX_QUEUE - queue.tracks.length;
      const tracksToAdd = tracks.slice(0, Math.max(0, availableSlots));

      if (tracksToAdd.length === 0) {
        return interaction.editReply(
          `**Queue is full** (max ${MAX_QUEUE} tracks). Use \`/clearqueue\` or \`/stop\` first.`
        );
      }

      for (const t of tracksToAdd) queue.tracks.push(t);

      // Auto-start if nothing is playing
      if (!queue.isPlaying) {
        await queue.playNext();
      }

      if (tracks.length === 1) {
        const t = tracksToAdd[0];
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(queue.isPlaying ? 'Added to Queue' : 'Now Playing')
          .setDescription(`**[${t.title}](${t.url})**`)
          .addFields(
            { name: 'Duration', value: formatDuration(t.duration), inline: true },
            { name: 'Artist', value: t.author, inline: true },
            { name: 'Source', value: t.source, inline: true },
            { name: 'Queue Position', value: `#${queue.tracks.length + (queue.isPlaying ? 1 : 0)}`, inline: true }
          )
          .setThumbnail(t.thumbnail || null)
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // Playlist response
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Playlist Added to Queue')
        .setDescription(
          `Added **${tracksToAdd.length}** track(s) to the queue.\n` +
          (tracks.length > tracksToAdd.length
            ? `*(${tracks.length - tracksToAdd.length} track(s) skipped — queue limit reached)*`
            : '')
        )
        .addFields({ name: 'Queue Size', value: `${queue.tracks.length + (queue.current ? 1 : 0)} tracks`, inline: true })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`/play error in guild ${interaction.guildId}: ${error.message}`);
      return interaction.editReply(`**Error:** ${error.message}`);
    }
  },
};
