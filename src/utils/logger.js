/**
 * Logger Utility
 *
 * Provides structured console and file logging with daily rotation.
 * Uses winston with timestamps on every log entry.
 */

'use strict';

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const LOG_PATH = process.env.LOG_PATH || './logs';

// Ensure the log directory exists
if (!fs.existsSync(LOG_PATH)) {
  fs.mkdirSync(LOG_PATH, { recursive: true });
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

// --- Custom log format ---
const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  const base = `[${ts}] [${level.toUpperCase()}] ${message}`;
  return stack ? `${base}\n${stack}` : base;
});

// --- Transport: rotating general log file ---
const generalRotate = new DailyRotateFile({
  filename: path.join(LOG_PATH, 'bot-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), logFormat),
});

// --- Transport: rotating error log file ---
const errorRotate = new DailyRotateFile({
  filename: path.join(LOG_PATH, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '30d',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), logFormat),
});

// --- Transport: rotating scrape-specific log file ---
const scrapeRotate = new DailyRotateFile({
  filename: path.join(LOG_PATH, 'scrape-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: '7d',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
});

// --- Transport: rotating voice log file ---
const voiceRotate = new DailyRotateFile({
  filename: path.join(LOG_PATH, 'voice-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '7d',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
});

// --- Main logger ---
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
      ),
    }),
    generalRotate,
    errorRotate,
  ],
});

// --- Scrape-specific child logger ---
logger.scrape = winston.createLogger({
  level: 'info',
  transports: [scrapeRotate],
});

// --- Voice-specific child logger ---
logger.voice = winston.createLogger({
  level: 'info',
  transports: [voiceRotate],
});

module.exports = logger;
