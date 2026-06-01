/**
 * Export Service
 *
 * Generates export files from the archived message database.
 * Supported formats: txt, json, jsonl, csv, pdf
 * Large exports are automatically compressed into ZIP archives.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const PDFDocument = require('pdfkit');
const { stringify } = require('csv-stringify/sync');
const { getDb } = require('../database/database');
const { getExportPath, formatMessageLine, formatBytes } = require('../utils/helpers');
const { getConfig } = require('../utils/config');
const logger = require('../utils/logger');

const cfg = getConfig();
const COMPRESS_THRESHOLD = (cfg.export?.compressThresholdMB || 8) * 1024 * 1024;

// ─── Data Fetching ─────────────────────────────────────────────────────────────

/**
 * Fetches messages from the database for a given guild/channel scope.
 * @param {string} guildId
 * @param {string|null} channelId - null = all channels in guild
 * @returns {object[]}
 */
function fetchMessages(guildId, channelId) {
  const db = getDb();
  if (channelId) {
    return db.prepare(
      'SELECT * FROM messages WHERE guild_id = ? AND channel_id = ? ORDER BY timestamp ASC'
    ).all(guildId, channelId);
  }
  return db.prepare(
    'SELECT * FROM messages WHERE guild_id = ? ORDER BY channel_id, timestamp ASC'
  ).all(guildId);
}

// ─── Format Writers ───────────────────────────────────────────────────────────

function writeTxt(messages, outputPath) {
  const lines = messages.map((m) => formatMessageLine(m)).join('\n');
  fs.writeFileSync(outputPath, lines, 'utf8');
}

function writeJson(messages, outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(messages, null, 2), 'utf8');
}

function writeJsonl(messages, outputPath) {
  const lines = messages.map((m) => JSON.stringify(m)).join('\n');
  fs.writeFileSync(outputPath, lines, 'utf8');
}

function writeCsv(messages, outputPath) {
  const rows = messages.map((m) => [
    m.timestamp,
    m.guild_id,
    m.channel_id,
    m.message_id,
    m.author_username,
    m.author_id,
    m.content || '',
    m.is_deleted ? 'true' : 'false',
    m.edited_timestamp || '',
    m.reply_to_id || '',
  ]);

  const headers = [
    'timestamp', 'guild_id', 'channel_id', 'message_id',
    'author_username', 'author_id', 'content',
    'is_deleted', 'edited_timestamp', 'reply_to_id',
  ];

  const csv = stringify(rows, { header: true, columns: headers });
  fs.writeFileSync(outputPath, csv, 'utf8');
}

function writePdf(messages, outputPath, channelLabel) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    doc.font('Helvetica-Bold').fontSize(16).text(`Archive Export — ${channelLabel}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(8).text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
    doc.moveDown(1);

    for (const m of messages) {
      const ts = new Date(m.timestamp).toLocaleString();
      const deleted = m.is_deleted ? ' [DELETED]' : '';
      const edited = m.edited_timestamp ? ' [EDITED]' : '';

      doc.font('Helvetica-Bold').fontSize(8).text(`${m.author_username}${deleted}${edited}`, { continued: true });
      doc.font('Helvetica').fillColor('#666666').text(`  ${ts}`, { continued: false });
      doc.fillColor('#000000').font('Helvetica').fontSize(9).text(m.content || '(no text content)');
      doc.moveDown(0.4);

      // Prevent exceeding page
      if (doc.y > doc.page.height - 60) doc.addPage();
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

/**
 * Wraps a single file in a ZIP archive. Deletes the original.
 * @param {string} filePath
 * @returns {Promise<string>} Path to the ZIP file
 */
function compressToZip(filePath) {
  return new Promise((resolve, reject) => {
    const zipPath = filePath + '.zip';
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', reject);
    output.on('close', () => {
      fs.unlinkSync(filePath);
      resolve(zipPath);
    });

    archive.pipe(output);
    archive.file(filePath, { name: path.basename(filePath) });
    archive.finalize();
  });
}

// ─── Main Export Function ─────────────────────────────────────────────────────

/**
 * Exports archived messages to the requested format.
 *
 * @param {string} guildId
 * @param {string|null} channelId - null = all channels
 * @param {string} format - 'txt'|'json'|'jsonl'|'csv'|'pdf'
 * @param {string} [channelName] - Used in filename/PDF title
 * @returns {Promise<string>} Path to the generated export file
 */
async function exportMessages(guildId, channelId, format, channelName = 'all') {
  const supported = ['txt', 'json', 'jsonl', 'csv', 'pdf'];
  if (!supported.includes(format)) {
    throw new Error(`Unsupported format "${format}". Choose from: ${supported.join(', ')}`);
  }

  const messages = fetchMessages(guildId, channelId);
  if (messages.length === 0) {
    throw new Error('No archived messages found for the requested scope.');
  }

  const exportDir = getExportPath(guildId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const label = channelName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `export_${label}_${timestamp}.${format}`;
  const outputPath = path.join(exportDir, filename);

  logger.info(`Exporting ${messages.length} messages to ${format.toUpperCase()} for guild ${guildId}`);

  switch (format) {
    case 'txt':   writeTxt(messages, outputPath); break;
    case 'json':  writeJson(messages, outputPath); break;
    case 'jsonl': writeJsonl(messages, outputPath); break;
    case 'csv':   writeCsv(messages, outputPath); break;
    case 'pdf':   await writePdf(messages, outputPath, channelName); break;
  }

  // Compress large files
  const fileSize = fs.statSync(outputPath).size;
  if (fileSize > COMPRESS_THRESHOLD && format !== 'pdf') {
    const zipPath = await compressToZip(outputPath);
    logger.info(`Compressed export: ${formatBytes(fileSize)} -> ${zipPath}`);
    return zipPath;
  }

  return outputPath;
}

module.exports = { exportMessages };
