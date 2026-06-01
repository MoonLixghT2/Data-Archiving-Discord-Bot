/**
 * Command: .backup
 *
 * Creates a full local ZIP archive of the entire data directory,
 * including the SQLite database, all message logs, and downloaded attachments.
 * The archive is saved to /data/backups/ with a timestamped filename.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { isAllowlisted, denyAccess } = require('../../utils/permissions');
const { getBackupPath, getStoragePath, formatBytes } = require('../../utils/helpers');
const { getConfig } = require('../../utils/config');
const logger = require('../../utils/logger');

module.exports = {
  name: 'backup',
  description: 'Creates a full ZIP backup of all archived data.',
  usage: '.backup',
  allowlistOnly: true,

  async execute(message, args, client) {
    if (!isAllowlisted(message)) return denyAccess(message);

    const statusMsg = await message.reply(
      '**Backup started.** This may take several minutes depending on archive size...'
    );

    const cfg = getConfig();
    const storagePath = cfg.storagePath;
    const backupDir = getBackupPath();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFilename = `backup_${message.guild.id}_${timestamp}.zip`;
    const zipPath = path.join(backupDir, zipFilename);

    try {
      await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 6 } });

        archive.on('error', reject);
        output.on('close', resolve);
        archive.pipe(output);

        // Include server-specific data folder
        const serverPath = path.join(storagePath, 'servers', message.guild.id);
        if (fs.existsSync(serverPath)) {
          archive.directory(serverPath, `servers/${message.guild.id}`);
        }

        // Include the database file
        const dbPath = path.join(storagePath, 'archiver.db');
        if (fs.existsSync(dbPath)) {
          archive.file(dbPath, { name: 'archiver.db' });
        }

        archive.finalize();
      });

      const fileSize = fs.statSync(zipPath).size;

      logger.info(
        `Backup created: ${zipPath} (${formatBytes(fileSize)}) ` +
        `by ${message.author.tag} in guild ${message.guild.id}`
      );

      await statusMsg.edit(
        `**Backup complete.**\n` +
        `- File: \`${zipFilename}\`\n` +
        `- Size: ${formatBytes(fileSize)}\n` +
        `- Location: \`${zipPath}\``
      );
    } catch (error) {
      logger.error(`Backup failed for guild ${message.guild.id}: ${error.message}`);
      await statusMsg.edit(`**Backup failed:** ${error.message}`);
    }
  },
};
