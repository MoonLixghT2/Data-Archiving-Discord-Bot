/**
 * Download Service
 *
 * Handles downloading Discord attachments to local storage.
 * Features:
 *   - Concurrent download queue with configurable limit
 *   - SHA-256 hash-based deduplication
 *   - Retry on failure with exponential backoff
 *   - File size limit enforcement
 *   - MIME-type-based subtype routing (images / videos / files)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mime = require('mime-types');
const { getConfig } = require('../utils/config');
const { getAttachmentPath, getAttachmentSubtype, sanitizeFilename, sleep } = require('../utils/helpers');
const { hashFile } = require('../utils/hash');
const { getDb } = require('../database/database');
const AsyncQueue = require('../utils/asyncQueue');
const logger = require('../utils/logger');

const cfg = getConfig();
const downloadQueue = new AsyncQueue(cfg.download?.maxConcurrent || 3);

/**
 * Determines the file extension from a URL or content type.
 * @param {string} url
 * @param {string} contentType
 * @returns {string}
 */
function resolveExtension(url, contentType) {
  const fromMime = contentType ? mime.extension(contentType) : null;
  if (fromMime) return `.${fromMime}`;
  const urlExt = path.extname(new URL(url).pathname);
  return urlExt || '';
}

/**
 * Downloads a single attachment and stores it locally.
 * Skips if already downloaded (via hash or existing DB record).
 *
 * @param {{
 *   id: string,
 *   url: string,
 *   filename: string,
 *   contentType: string,
 *   size: number,
 *   messageId: string,
 *   guildId: string,
 *   channelId: string
 * }} attachment
 * @returns {Promise<string|null>} Local file path, or null if skipped/failed
 */
async function downloadAttachment(attachment) {
  return downloadQueue.add(() => _doDownload(attachment));
}

async function _doDownload(attachment) {
  const db = getDb();
  const maxBytes = (cfg.download?.maxFileSizeMB || 500) * 1024 * 1024;

  // Check if already recorded in DB
  const existing = db.prepare(
    'SELECT local_path FROM attachments WHERE attachment_id = ?'
  ).get(attachment.id);

  if (existing?.local_path && fs.existsSync(existing.local_path)) {
    return existing.local_path;
  }

  // Enforce file size limit
  if (attachment.size && attachment.size > maxBytes) {
    logger.warn(`Skipping oversized attachment: ${attachment.filename} (${attachment.size} bytes)`);
    return null;
  }

  const subtype = getAttachmentSubtype(attachment.contentType);
  const dir = getAttachmentPath(attachment.guildId, attachment.channelId, subtype, attachment.channelName);
  const ext = resolveExtension(attachment.url, attachment.contentType);
  const safeName = sanitizeFilename(path.basename(attachment.filename, ext));
  const filename = `${safeName}_${attachment.id}${ext}`;
  const localPath = path.join(dir, filename);

  const maxRetries = cfg.scrape?.maxRetries || 3;
  const retryDelay = cfg.scrape?.retryDelay || 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios({
        method: 'GET',
        url: attachment.url,
        responseType: 'stream',
        timeout: cfg.download?.timeoutMs || 30000,
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.on('error', reject);
      });

      const fileHash = await hashFile(localPath);

      // Check for duplicate by hash
      const duplicate = db.prepare(
        'SELECT local_path FROM attachments WHERE file_hash = ? AND attachment_id != ?'
      ).get(fileHash, attachment.id);

      if (duplicate?.local_path && fs.existsSync(duplicate.local_path)) {
        fs.unlinkSync(localPath);
        logger.info(`Duplicate attachment skipped (hash match): ${attachment.filename}`);
        // Still record in DB with the existing path
        upsertAttachmentRecord(attachment, duplicate.local_path, fileHash);
        return duplicate.local_path;
      }

      upsertAttachmentRecord(attachment, localPath, fileHash);
      logger.scrape.info(`Downloaded: ${attachment.filename} -> ${localPath}`);
      return localPath;
    } catch (error) {
      logger.warn(`Download attempt ${attempt}/${maxRetries} failed for ${attachment.filename}: ${error.message}`);
      if (attempt < maxRetries) await sleep(retryDelay * attempt);
    }
  }

  logger.error(`Failed to download attachment after ${maxRetries} attempts: ${attachment.filename}`);
  return null;
}

/**
 * Inserts or updates an attachment record in the database.
 * @param {object} attachment
 * @param {string} localPath
 * @param {string} fileHash
 */
function upsertAttachmentRecord(attachment, localPath, fileHash) {
  const db = getDb();
  db.prepare(`
    INSERT INTO attachments (message_id, guild_id, channel_id, attachment_id, filename, content_type, size_bytes, url, local_path, file_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(attachment_id) DO UPDATE SET local_path = excluded.local_path, file_hash = excluded.file_hash
  `).run(
    attachment.messageId,
    attachment.guildId,
    attachment.channelId,
    attachment.id,
    attachment.filename,
    attachment.contentType || null,
    attachment.size || null,
    attachment.url,
    localPath,
    fileHash
  );
}

/**
 * Downloads all attachments from a Discord message object.
 * @param {import('discord.js').Message} message
 * @returns {Promise<string[]>} Array of local paths
 */
async function downloadMessageAttachments(message) {
  if (!message.attachments?.size) return [];

  const results = [];
  for (const [, att] of message.attachments) {
    const localPath = await downloadAttachment({
      id: att.id,
      url: att.url,
      filename: att.name || 'unknown',
      contentType: att.contentType || '',
      size: att.size,
      messageId: message.id,
      guildId: message.guildId,
      channelId: message.channelId,
      channelName: message.channel?.name,
    });
    if (localPath) results.push(localPath);
  }
  return results;
}

module.exports = { downloadAttachment, downloadMessageAttachments };
