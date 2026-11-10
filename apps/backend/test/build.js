const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Expo } = require('expo-server-sdk');

const { initializeDatabase } = require('../src/db');
const auth = require('../src/auth');
const { createApp } = require('../src/app');

/**
 * Build an app backed by an in-memory database with push delivery stubbed out.
 * Returns { app, db, sent } where `sent` collects every stubbed push message.
 */
function buildTestApp(overrides = {}) {
  const db = initializeDatabase(':memory:');
  const sent = [];
  const sendPush = overrides.sendPush || (async (message) => {
    sent.push(message);
    return [{ status: 'ok', id: `t-${sent.length}` }];
  });

  const app = createApp({
    db,
    sendPush,
    config: {
      timestampTolerance: 300000,
      cleanupKey: overrides.cleanupKey ?? 'test-cleanup-key-1234567890',
      trustProxyHops: 0,
      isProd: false,
    },
    deps: { express, helmet, rateLimit, Expo, auth },
  });

  return { app, db, sent };
}

module.exports = { buildTestApp };
