/**
 * Slash Commands: /skip /stop /pause /resume /nowplaying /queue /clearqueue
 *
 * Music playback control commands. All public.
 * Each command is exported individually and loaded by the command handler.
 */

'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueue, destroyQueue } = require('../../services/musicPlayer');
const { formatDuration } = require('../../utils/helpers');

// ─── /skip ────────────────────────────────────────────────────────────────────

module.exports.skip = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track.'),

  async execute(interaction, client) {
    const queue = client.musicQueues.get(interaction.guildId);

    if (!queue?.current) {
      return interaction.reply({ content: '**Nothing is currently playing.**', ephemeral: true });
    }

    const skipped = queue.current.title;
    queue.skip();
    return interaction.reply(`**Skipped:** ${skipped}`);
  },
};

// ─── /stop ────────────────────────────────────────────────────────────────────

module.exports.stop = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, clear the queue, and disconnect.'),

  async execute(interaction, client) {
    const queue = client.musicQueues.get(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '**Nothing is playing.**', ephemeral: true });
    }

    destroyQueue(client, interaction.guildId);
    return interaction.reply('**Playback stopped.** Queue cleared and disconnected.');
  },
};

// ─── /pause ───────────────────────────────────────────────────────────────────

module.exports.pause = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current track.'),

  async execute(interaction, client) {
    const queue = client.musicQueues.get(interaction.guildId);

    if (!queue?.isPlaying) {
      return interaction.reply({ content: '**Nothing is currently playing.**', ephemeral: true });
    }

    queue.pause();
    return interaction.reply(`**Paused:** ${queue.current?.title || 'current track'}`);
  },
};

// ─── /resume ──────────────────────────────────────────────────────────────────

module.exports.resume = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume paused playback.'),

  async execute(interaction, client) {
    const queue = client.musicQueues.get(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '**Nothing is paused.**', ephemeral: true });
    }

    queue.unpause();
    return interaction.reply(`**Resumed:** ${queue.current?.title || 'current track'}`);
  },
};

// ─── /nowplaying ──────────────────────────────────────────────────────────────

module.exports.nowplaying = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Shows details about the currently playing track.'),

  async execute(interaction, client) {
    const queue = client.musicQueues.get(interaction.guildId);
    const info = queue?.getNowPlayingInfo();

    if (!info) {
      return interaction.reply({ content: '**Nothing is currently playing.**', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Now Playing')
      .setDescription(`**[${info.title}](${info.url})**`)
      .addFields(
        { name: 'Duration', value: info.duration, inline: true },
        { name: 'Artist', value: info.author, inline: true },
        { name: 'Source', value: info.source, inline: true },
        { name: 'Tracks in Queue', value: `${queue.tracks.length}`, inline: true }
      )
      .setThumbnail(info.thumbnail || null)
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};

// ─── /queue ───────────────────────────────────────────────────────────────────

module.exports.queue = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View the current music queue.')
    .addIntegerOption((opt) =>
      opt.setName('page').setDescription('Page number').setMinValue(1)
    ),

  async execute(interaction, client) {
    const queue = client.musicQueues.get(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '**The queue is empty.**', ephemeral: true });
    }

    const page = interaction.options.getInteger('page') || 1;
    const { tracks, total, totalPages } = queue.getQueueList(page, 10);

    if (total === 0 && !queue.current) {
      return interaction.reply({ content: '**The queue is empty.**', ephemeral: true });
    }

    const lines = [];

    if (queue.current) {
      lines.push(`**Now Playing:**\n[${queue.current.title}](${queue.current.url}) — ${formatDuration(queue.current.duration)}`);
    }

    if (tracks.length > 0) {
      lines.push('\n**Up Next:**');
      const offset = (page - 1) * 10;
      tracks.forEach((t, i) => {
        lines.push(`${offset + i + 1}. [${t.title}](${t.url}) — ${formatDuration(t.duration)}`);
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`Music Queue — ${total} track(s) waiting`)
      .setDescription(lines.join('\n') || 'Queue is empty.')
      .setFooter({ text: `Page ${page}/${totalPages}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};

// ─── /clearqueue ──────────────────────────────────────────────────────────────

module.exports.clearqueue = {
  data: new SlashCommandBuilder()
    .setName('clearqueue')
    .setDescription('Clear all upcoming tracks. Current track continues playing.'),

  async execute(interaction, client) {
    const queue = client.musicQueues.get(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '**Nothing is playing.**', ephemeral: true });
    }

    const count = queue.tracks.length;
    queue.clearQueue();

    return interaction.reply(
      count > 0
        ? `**Queue cleared.** Removed ${count} track(s). Current track continues.`
        : '**Queue was already empty.** Current track continues.'
    );
  },
};
