/**
 * SQLite Database Manager for User/Lead/Outreach models.
 * Upgraded to ESModules with dynamic better-sqlite3 and JSON fallback compatibility.
 */

import fs from 'fs';
import path from 'path';

let DatabaseModule = null;
let db = null;
let useFallback = false;

const dbFile = path.resolve(process.cwd(), 'data', 'equilibrium.db');
const usersFile = path.resolve(process.cwd(), 'data', 'users.json');
const leadsFile = path.resolve(process.cwd(), 'data', 'leads.json');
const messagesFile = path.resolve(process.cwd(), 'data', 'messages.json');

try {
  const betterSqlite = await import('better-sqlite3');
  DatabaseModule = betterSqlite.default;
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  db = new DatabaseModule(dbFile);
  
  // Create tables if they do not exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      hashed_password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company_name TEXT UNIQUE NOT NULL,
      contact_person TEXT,
      phone TEXT,
      category TEXT,
      source TEXT DEFAULT 'custom',
      stage TEXT DEFAULT 'new',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS outreach_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      channel TEXT DEFAULT 'whatsapp',
      message_text TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE
    );
  `);
} catch (err) {
  console.warn(`[AuthDatabase] SQLite unavailable (${err.message}). Activating JSON file fallbacks.`);
  useFallback = true;
  fs.mkdirSync(path.dirname(usersFile), { recursive: true });
}

export { db, useFallback, usersFile, leadsFile, messagesFile };
