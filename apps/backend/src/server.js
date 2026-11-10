require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Expo } = require('expo-server-sdk');

const { initializeDatabase } = require('./db');
const auth = require('./auth');
const { createApp } = require('./app');

// --- Configuration ---
const PORT = parseInt(process.env.PORT, 10) || 3000;
const DB_PATH = process.env.DB_PATH || './data/whispers.db';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const TIMESTAMP_TOLERANCE = parseInt(process.env.TIMESTAMP_TOLERANCE, 10) || 300000;
const TRUST_PROXY_HOPS = parseInt(process.env.TRUST_PROXY_HOPS, 10);
const CLEANUP_KEY = process.env.CLEANUP_KEY || '';
const PUSH_DRY_RUN = process.env.PUSH_DRY_RUN === 'true';

const PLACEHOLDER_KEYS = new Set(['', 'change-me-in-production', 'change-me']);

// Fail fast on an unsafe production configuration.
if (IS_PROD) {
  const problems = [];
  if (PLACEHOLDER_KEYS.has(CLEANUP_KEY) || CLEANUP_KEY.length < 16) {
    problems.push('CLEANUP_KEY must be set to a random value of at least 16 characters');
  }
  if (!Number.isInteger(TRUST_PROXY_HOPS)) {
    problems.push('TRUST_PROXY_HOPS must be set explicitly (number of proxies in front of this service)');
  }
  if (problems.length) {
    console.error('Refusing to start in production with an unsafe configuration:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

const db = initializeDatabase(DB_PATH);
const expo = new Expo();

async function sendPush(message) {
  if (PUSH_DRY_RUN) {
    return [{ status: 'ok', id: 'dry-run', dryRun: true }];
  }
  return expo.sendPushNotificationsAsync([message]);
}

const app = createApp({
  db,
  sendPush,
  config: {
    timestampTolerance: TIMESTAMP_TOLERANCE,
    cleanupKey: CLEANUP_KEY,
    // Default to 0 (trust nobody, use the socket IP). Trusting a client-supplied
    // X-Forwarded-For lets an attacker rotate it to dodge the per-IP rate limit.
    // Production must set TRUST_PROXY_HOPS explicitly (enforced above).
    trustProxyHops: Number.isInteger(TRUST_PROXY_HOPS) ? TRUST_PROXY_HOPS : 0,
    isProd: IS_PROD,
  },
  deps: { express, helmet, rateLimit, Expo, auth },
});

// Periodically drop expired replay records and stale recipients.
const cleanupTimer = setInterval(() => {
  try {
    db.cleanup();
  } catch (err) {
    console.error('Background cleanup failed:', err.message);
  }
}, 10 * 60 * 1000);
cleanupTimer.unref();

const server = app.listen(PORT, () => {
  console.log(`Whispers backend running on port ${PORT} (env: ${NODE_ENV})`);
  if (PUSH_DRY_RUN) console.log('PUSH_DRY_RUN enabled - notifications are not delivered');
});

function shutdown() {
  clearInterval(cleanupTimer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server };
