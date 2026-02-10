const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function initializeDatabase(dbPath) {
  // Ensure data directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Create recipients table
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id TEXT UNIQUE NOT NULL,
      expo_push_token TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index on recipient_id for fast lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_recipient_id 
    ON recipients(recipient_id)
  `);

  console.log('✓ Database initialized');
  return db;
}

module.exports = { initializeDatabase };
