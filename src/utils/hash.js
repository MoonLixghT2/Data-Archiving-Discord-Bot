/**
 * Hash Utility
 *
 * Provides SHA-256 hashing for file integrity verification
 * and duplicate detection during attachment downloads.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');

/**
 * Computes the SHA-256 hash of a file at the given path.
 * @param {string} filePath
 * @returns {Promise<string>} Hex-encoded hash string
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Computes the SHA-256 hash of a Buffer or string.
 * @param {Buffer|string} data
 * @returns {string} Hex-encoded hash string
 */
function hashBuffer(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Computes a short SHA-256 hash (first 16 hex chars) for use in filenames.
 * @param {string} input
 * @returns {string}
 */
function shortHash(input) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

module.exports = { hashFile, hashBuffer, shortHash };
