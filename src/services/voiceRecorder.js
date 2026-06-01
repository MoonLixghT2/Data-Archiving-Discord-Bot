/**
 * Voice Recorder Service
 *
 * Joins Discord voice channels and records each participant's audio
 * to separate WAV files using @discordjs/voice's audio receiver API.
 *
 * Audio pipeline:
 *   User Opus stream -> prism-media Opus decoder -> PCM -> WAV file
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  EndBehaviorType,
  entersState,
} = require('@discordjs/voice');
const prism = require('prism-media');
const { getVoicePath } = require('../utils/helpers');
const { getDb } = require('../database/database');
const { getConfig } = require('../utils/config');
const logger = require('../utils/logger');

const cfg = getConfig();
const SAMPLE_RATE = cfg.voice?.sampleRate || 48000;
const CHANNELS = cfg.voice?.channels || 2;
const BIT_DEPTH = cfg.voice?.bitDepth || 16;
const SILENCE_MS = cfg.voice?.silenceThresholdMs || 1500;

// ─── WAV Header ───────────────────────────────────────────────────────────────

/**
 * Writes a valid WAV file header for raw PCM audio.
 * The data size is set to 0 and updated on stream close.
 * @param {fs.WriteStream} stream
 */
function writeWavHeader(stream) {
  const byteRate = SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8);
  const blockAlign = CHANNELS * (BIT_DEPTH / 8);
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(0, 4);           // ChunkSize — updated on close
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);         // Subchunk1Size (PCM = 16)
  header.writeUInt16LE(1, 20);          // AudioFormat (1 = PCM)
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BIT_DEPTH, 34);
  header.write('data', 36);
  header.writeUInt32LE(0, 40);          // Subchunk2Size — updated on close

  stream.write(header);
}

/**
 * Updates the WAV header's size fields once recording is complete.
 * @param {string} filePath
 */
function finalizeWavHeader(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const dataSize = stat.size - 44;
    const fd = fs.openSync(filePath, 'r+');
    const buf = Buffer.alloc(4);

    buf.writeUInt32LE(dataSize + 36, 0);
    fs.writeSync(fd, buf, 0, 4, 4);    // RIFF chunk size

    buf.writeUInt32LE(dataSize, 0);
    fs.writeSync(fd, buf, 0, 4, 40);   // data chunk size

    fs.closeSync(fd);
  } catch (err) {
    logger.voice.error(`Failed to finalize WAV header for ${filePath}: ${err.message}`);
  }
}

// ─── Session Management ───────────────────────────────────────────────────────

/**
 * Starts a voice recording session in the given voice channel.
 * Each speaking user gets a dedicated WAV file.
 *
 * @param {import('discord.js').VoiceChannel} voiceChannel
 * @param {import('discord.js').Client} client
 * @returns {Promise<object>} Session object
 */
async function startRecording(voiceChannel, client) {
  const { id: channelId, guildId, name: channelName } = voiceChannel;

  // Disconnect any existing session in this guild
  const existing = client.voiceSessions.get(guildId);
  if (existing) {
    await stopRecording(guildId, client);
  }

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
  });

  // Handle disconnects — covers both network blips and NetworkStateChange events
  // (Discord closing the WebSocket momentarily). Give the library up to 5 s to
  // re-enter Signalling/Connecting before treating the drop as permanent.
  connection.on(VoiceConnectionStatus.Disconnected, async (_oldState, newState) => {
    // reason === 1 means the adapter explicitly destroyed the connection (e.g. bot
    // was removed from the guild or stopRecording() was already called). Don't try
    // to recover — that would re-enter the channel we just intentionally left.
    if (newState && newState.reason != null && newState.reason !== 0) return;

    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      // Re-connecting successfully — nothing more to do.
    } catch {
      // Could not recover; tear down the session gracefully so WAV headers are
      // finalised and the DB record is updated.
      await stopRecording(guildId, client).catch(() => connection.destroy());
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
  } catch {
    connection.destroy();
    throw new Error('Failed to join the voice channel within 10 seconds.');
  }

  const outputDir = getVoicePath(guildId, channelId, voiceChannel.name);
  const startedAt = new Date();
  const activeStreams = new Map(); // userId => { fileStream, decoder }
  const filePaths = [];

  // Insert session into DB
  const db = getDb();
  const sessionRow = db.prepare(`
    INSERT INTO voice_sessions (guild_id, channel_id, channel_name, started_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, channelId, channelName, startedAt.toISOString());
  const sessionId = sessionRow.lastInsertRowid;

  const receiver = connection.receiver;

  receiver.speaking.on('start', (userId) => {
    if (activeStreams.has(userId)) return;

    const member = voiceChannel.guild.members.cache.get(userId);
    const username = member?.user?.username || userId;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${timestamp}_${username}_${userId}.wav`;
    const filePath = path.join(outputDir, fileName);

    const fileStream = fs.createWriteStream(filePath);
    writeWavHeader(fileStream);

    const opusStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_MS },
    });

    const decoder = new prism.opus.Decoder({
      rate: SAMPLE_RATE,
      channels: CHANNELS,
      frameSize: 960,
    });

    opusStream.pipe(decoder).pipe(fileStream, { end: false });

    opusStream.on('end', () => {
      decoder.unpipe(fileStream);
      fileStream.end(() => {
        finalizeWavHeader(filePath);
        logger.voice.info(`Recording saved: ${filePath}`);
      });
      activeStreams.delete(userId);
      filePaths.push(filePath);
    });

    activeStreams.set(userId, { fileStream, decoder, opusStream });
    logger.voice.info(`Recording started for user ${username} (${userId})`);
  });

  const session = {
    connection,
    channelId,
    channelName,
    guildId,
    startedAt,
    activeStreams,
    filePaths,
    sessionId,
  };

  client.voiceSessions.set(guildId, session);
  logger.voice.info(`Voice session started in #${channelName} (guild ${guildId})`);

  return session;
}

/**
 * Stops the active voice recording session for a guild and saves metadata.
 * @param {string} guildId
 * @param {import('discord.js').Client} client
 * @returns {Promise<object|null>} Completed session data
 */
async function stopRecording(guildId, client) {
  const session = client.voiceSessions.get(guildId);
  if (!session) return null;

  // Stop all active user streams
  for (const [userId, { opusStream, fileStream, decoder }] of session.activeStreams) {
    try {
      opusStream.destroy();
      decoder.unpipe(fileStream);
      fileStream.end();
    } catch { /* ignore cleanup errors */ }
  }

  session.connection.destroy();
  client.voiceSessions.delete(guildId);

  const endedAt = new Date();

  // Update DB session record
  const db = getDb();
  db.prepare(`
    UPDATE voice_sessions
    SET ended_at = ?, file_paths = ?, participants = ?
    WHERE id = ?
  `).run(
    endedAt.toISOString(),
    JSON.stringify(session.filePaths),
    JSON.stringify([...session.activeStreams.keys()]),
    session.sessionId
  );

  logger.voice.info(
    `Voice session ended in #${session.channelName}. Saved ${session.filePaths.length} recording(s).`
  );

  return session;
}

module.exports = { startRecording, stopRecording };
