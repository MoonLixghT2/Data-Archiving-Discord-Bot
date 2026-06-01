/**
 * Music Player Service
 *
 * Manages per-guild music queues and audio playback.
 * Uses play-dl for YouTube, SoundCloud, and Spotify (via YT search fallback).
 * Uses @discordjs/voice for the audio pipeline.
 */

'use strict';

const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
} = require('@discordjs/voice');
const play = require('play-dl');
const { getConfig } = require('../utils/config');
const { formatDuration } = require('../utils/helpers');
const logger = require('../utils/logger');

const cfg = getConfig();
const MAX_QUEUE = cfg.music?.maxQueueSize || 200;
const LEAVE_ON_EMPTY_MS = cfg.music?.leaveOnEmptyMs || 60000;
const LEAVE_ON_FINISH_MS = cfg.music?.leaveOnFinishMs || 30000;

// ─── Track Info ───────────────────────────────────────────────────────────────

/**
 * Fetches track metadata from a URL or search query.
 * @param {string} query - URL or search term
 * @returns {Promise<object[]>} Array of track info objects
 */
async function resolveTracks(query) {
  let info;

  const urlType = await play.validate(query).catch(() => false);

  if (urlType === 'yt_video') {
    const data = await play.video_info(query);
    return [{
      title: data.video_details.title,
      url: data.video_details.url,
      duration: data.video_details.durationInSec * 1000,
      thumbnail: data.video_details.thumbnails?.[0]?.url,
      author: data.video_details.channel?.name || 'Unknown',
      source: 'youtube',
    }];
  }

  if (urlType === 'yt_playlist') {
    const playlist = await play.playlist_info(query, { incomplete: true });
    const videos = await playlist.all_videos();
    return videos.map((v) => ({
      title: v.title,
      url: v.url,
      duration: v.durationInSec * 1000,
      thumbnail: v.thumbnails?.[0]?.url,
      author: v.channel?.name || 'Unknown',
      source: 'youtube',
    }));
  }

  if (urlType === 'so_playlist' || urlType === 'so_track') {
    const scInfo = await play.soundcloud(query);
    if (scInfo.type === 'track') {
      return [{
        title: scInfo.name,
        url: scInfo.permalink,
        duration: scInfo.durationInMs,
        thumbnail: scInfo.thumbnail,
        author: scInfo.user.name,
        source: 'soundcloud',
      }];
    }
    if (scInfo.type === 'playlist') {
      const tracks = await scInfo.all_tracks();
      return tracks.map((t) => ({
        title: t.name,
        url: t.permalink,
        duration: t.durationInMs,
        thumbnail: t.thumbnail,
        author: t.user.name,
        source: 'soundcloud',
      }));
    }
  }

  if (urlType === 'sp_track' || urlType === 'sp_playlist' || urlType === 'sp_album') {
    // Spotify: convert to YouTube search
    const spData = await play.spotify(query);
    const tracksToResolve = spData.type === 'track' ? [spData] : await spData.all_tracks();
    const results = [];
    for (const sp of tracksToResolve.slice(0, 50)) {
      const searchQuery = `${sp.name} ${sp.artists?.map((a) => a.name).join(' ')}`;
      const ytResults = await play.search(searchQuery, { source: { youtube: 'video' }, limit: 1 });
      if (ytResults.length) {
        results.push({
          title: sp.name,
          url: ytResults[0].url,
          duration: sp.durationInMs,
          thumbnail: sp.thumbnail?.url || ytResults[0].thumbnails?.[0]?.url,
          author: sp.artists?.map((a) => a.name).join(', ') || 'Unknown',
          source: 'spotify',
        });
      }
    }
    return results;
  }

  // Plain text search — use YouTube
  const ytResults = await play.search(query, { source: { youtube: 'video' }, limit: 1 });
  if (!ytResults.length) throw new Error('No results found for the given search query.');

  const v = ytResults[0];
  return [{
    title: v.title,
    url: v.url,
    duration: v.durationInSec * 1000,
    thumbnail: v.thumbnails?.[0]?.url,
    author: v.channel?.name || 'Unknown',
    source: 'youtube',
  }];
}

// ─── MusicQueue Class ─────────────────────────────────────────────────────────

class MusicQueue {
  constructor(guildId) {
    this.guildId = guildId;
    this.tracks = [];           // Array of track info objects
    this.current = null;        // Currently playing track
    this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    this.connection = null;
    this.volume = cfg.music?.volumeDefault || 0.8;
    this._leaveTimer = null;

    this.player.on(AudioPlayerStatus.Idle, () => this._onTrackEnd());
    this.player.on('error', (err) => {
      logger.error(`Music player error in guild ${guildId}: ${err.message}`);
      this._onTrackEnd();
    });
  }

  _clearLeaveTimer() {
    if (this._leaveTimer) { clearTimeout(this._leaveTimer); this._leaveTimer = null; }
  }

  _scheduleLeave(ms) {
    this._clearLeaveTimer();
    this._leaveTimer = setTimeout(() => this.destroy(), ms);
  }

  async _onTrackEnd() {
    this.current = null;
    if (this.tracks.length > 0) {
      await this.playNext();
    } else {
      // Only schedule auto-leave if we're truly finished — not while playNext()
      // is still resolving the stream (which can take a second or two and would
      // temporarily leave tracks.length === 0 before the shift).
      this._scheduleLeave(LEAVE_ON_FINISH_MS);
    }
  }

  async join(voiceChannel) {
    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    this.connection.subscribe(this.player);

    // Attach BEFORE entersState(Ready) so disconnects during the initial
    // handshake are caught and the connection is given a chance to recover.
    this.connection.on(VoiceConnectionStatus.Disconnected, async (_oldState, newState) => {
      // If the connection was intentionally destroyed (reason !== 0), skip recovery.
      if (newState && newState.reason != null && newState.reason !== 0) return;

      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Re-connecting successfully.
      } catch {
        this.destroy();
      }
    });

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 10_000);
    } catch {
      this.connection.destroy();
      throw new Error('Could not connect to the voice channel.');
    }
  }

  async playNext() {
    if (!this.tracks.length) return;

    const track = this.tracks[0]; // Peek — don't shift until stream succeeds
    this.current = track;
    this._clearLeaveTimer();

    try {
      const source = await play.stream(track.url, { quality: 2 });
      const resource = createAudioResource(source.stream, { inputType: source.type });
      this.tracks.shift(); // Only remove from queue once we have a valid stream
      this.player.play(resource);
    } catch (err) {
      logger.error(`Failed to stream track "${track.title}": ${err.message}`);
      this.tracks.shift(); // Remove the broken track so we don't retry it endlessly
      this.current = null;
      await this._onTrackEnd();
    }
  }

  /** @returns {boolean} true if playback was started */
  get isPlaying() {
    return this.player.state.status !== AudioPlayerStatus.Idle;
  }

  pause() { this.player.pause(); }
  unpause() { this.player.unpause(); }
  skip() { this.player.stop(); }

  stop() {
    this.tracks = [];
    this.current = null;
    this.player.stop(true);
    this._scheduleLeave(5000);
  }

  clearQueue() { this.tracks = []; }

  destroy() {
    this._clearLeaveTimer();
    this.player.stop(true);
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
  }

  /** Formatted status embed fields */
  getNowPlayingInfo() {
    if (!this.current) return null;
    return {
      title: this.current.title,
      url: this.current.url,
      author: this.current.author,
      duration: formatDuration(this.current.duration),
      thumbnail: this.current.thumbnail,
      source: this.current.source,
    };
  }

  getQueueList(page = 1, pageSize = 10) {
    const offset = (page - 1) * pageSize;
    return {
      tracks: this.tracks.slice(offset, offset + pageSize),
      total: this.tracks.length,
      page,
      totalPages: Math.max(1, Math.ceil(this.tracks.length / pageSize)),
    };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Gets or creates a MusicQueue for a guild.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @returns {MusicQueue}
 */
function getQueue(client, guildId) {
  if (!client.musicQueues.has(guildId)) {
    const q = new MusicQueue(guildId);
    client.musicQueues.set(guildId, q);
  }
  return client.musicQueues.get(guildId);
}

/**
 * Destroys a guild's queue and removes it from the client map.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 */
function destroyQueue(client, guildId) {
  const q = client.musicQueues.get(guildId);
  if (q) { q.destroy(); client.musicQueues.delete(guildId); }
}

module.exports = { resolveTracks, getQueue, destroyQueue, MAX_QUEUE };
