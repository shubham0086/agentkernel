/**
 * SQLite-based response caching to save token costs.
 * Keyed by SHA-256(systemPrompt + prompt).
 * Upgraded to ESModules with seamless in-memory fallback.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let DatabaseModule = null;
let db = null;
let useFallback = false;
let fallbackCache = new Map();
const fallbackFile = path.resolve(process.cwd(), 'data', 'cache.json');

try {
  // Try loading better-sqlite3 dynamically
  const betterSqlite = await import('better-sqlite3');
  DatabaseModule = betterSqlite.default;
  const dbPath = path.resolve(process.cwd(), 'data', 'cache.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseModule(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_cache (
      key TEXT PRIMARY KEY,
      response TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch (err) {
  console.warn(`[ResponseCache] SQLite database unavailable (${err.message}). Falling back to JSON cache file.`);
  useFallback = true;
  fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
  if (fs.existsSync(fallbackFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
      fallbackCache = new Map(Object.entries(data));
    } catch (_) {}
  }
}

export class ResponseCache {
  /**
   * Calculate SHA-256 key for prompts.
   * @param {string} systemPrompt 
   * @param {string} prompt 
   * @returns {string}
   */
  static calculateKey(systemPrompt, prompt) {
    const raw = `${systemPrompt}\x00${prompt}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Fetch cached response, returns null if not found.
   * @param {string} systemPrompt 
   * @param {string} prompt 
   * @returns {string|null}
   */
  get(systemPrompt, prompt) {
    const key = ResponseCache.calculateKey(systemPrompt, prompt);
    if (useFallback) {
      return fallbackCache.get(key) || null;
    }

    try {
      const stmt = db.prepare('SELECT response FROM prompt_cache WHERE key = ?');
      const row = stmt.get(key);
      if (row) return row.response;
    } catch (e) {
      console.error(`[ResponseCache] Get cache failed: ${e.message}`);
    }
    return null;
  }

  /**
   * Cache a prompt response.
   * @param {string} systemPrompt 
   * @param {string} prompt 
   * @param {string} response 
   */
  set(systemPrompt, prompt, response) {
    const key = ResponseCache.calculateKey(systemPrompt, prompt);
    if (useFallback) {
      fallbackCache.set(key, response);
      try {
        const obj = Object.fromEntries(fallbackCache.entries());
        fs.writeFileSync(fallbackFile, JSON.stringify(obj, null, 2), 'utf8');
      } catch (e) {
        console.error(`[ResponseCache] Write fallback failed: ${e.message}`);
      }
      return;
    }

    try {
      const stmt = db.prepare('INSERT OR REPLACE INTO prompt_cache (key, response) VALUES (?, ?)');
      stmt.run(key, response);
    } catch (e) {
      console.error(`[ResponseCache] Set cache failed: ${e.message}`);
    }
  }
}
