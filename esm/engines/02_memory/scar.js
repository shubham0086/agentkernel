/**
 * Sovereign Critical Action Record (SCAR) database and Repeat Failure Guard.
 * Prevents AI agents from repeating identical errors in loops.
 * Upgraded to ESModules with seamless in-memory fallback.
 */

import fs from 'fs';
import path from 'path';

let DatabaseModule = null;
let db = null;
let useFallback = false;
let fallbackIncidents = [];
const fallbackFile = path.resolve(process.cwd(), 'data', 'incidents.json');

try {
  const betterSqlite = await import('better-sqlite3');
  DatabaseModule = betterSqlite.default;
  const dbPath = path.resolve(process.cwd(), 'data', 'scars.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseModule(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      type TEXT NOT NULL,
      agent TEXT NOT NULL,
      provider TEXT NOT NULL,
      status_code INTEGER,
      message TEXT NOT NULL,
      goal_id TEXT
    )
  `);
} catch (err) {
  console.warn(`[SCAR] SQLite database unavailable (${err.message}). Falling back to JSON incident logs.`);
  useFallback = true;
  fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
  if (fs.existsSync(fallbackFile)) {
    try {
      fallbackIncidents = JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
    } catch (_) {}
  }
}

export class SCAR {
  constructor(workspaceId = 'default', projectId = 'core') {
    this.workspaceId = workspaceId;
    this.projectId = projectId;

    this.knownFixes = [
      {
        regex: /fn\.apply is not a function|route file does not export a function|liveness check failed/i,
        label: 'ROUTE FACTORY EXPORT',
        hint: 'Route files MUST export a factory function: `module.exports = function(app) { app.get(...) }`. NEVER export a raw Express Router.'
      },
      {
        regex: /guardian rejection|banned call|forbidden execution/i,
        label: 'BANNED CALL EXHAUSTION',
        hint: 'eval(), exec(), or child_process.exec() are forbidden by security policies. Use spawn() with explicit args instead.'
      },
      {
        regex: /path traversal|path sanitization/i,
        label: 'PATH TRAVERSAL ATTEMPT',
        hint: 'No `..` or absolute paths. Always relative-to-projectRoot. Validate with path.resolve + startsWith check.'
      },
      {
        regex: /search block did not match|search.*replace.*invalid/i,
        label: 'INVALID SEARCH/REPLACE DIFF',
        hint: 'The SEARCH block must match the target file exactly. Double check whitespace and line endings, or use empty SEARCH blocks.'
      },
      {
        regex: /syntax check failed|unexpected end of input|unexpected token/i,
        label: 'SYNTAX COMPLIANCE ERROR',
        hint: 'Output must be valid syntax. Verify braces, brackets, parentheses, and commas. Never truncate output mid-block.'
      },
      {
        regex: /esm import|esmodule.*\.js file|cannot use import/i,
        label: 'ESM IMPORT IN COMMONJS',
        hint: 'This file runs in a CommonJS project. Use `const x = require(...)` and `module.exports = x`. Do NOT use `import` / `export` syntax.'
      },
      {
        regex: /rate limit|quota exceeded|429 status/i,
        label: 'API RATE LIMIT TRIGGER',
        hint: 'Provider is currently rate-limited. Wait or adjust model chains to route to cheaper/local providers first.'
      },
      {
        regex: /timeout|request exceeded \d+s/i,
        label: 'REQUEST TIMEOUT EXPIRED',
        hint: 'Inference took too long. Reduce output tokens size or request complexity. Check provider status.'
      }
    ];
  }

  /**
   * Clear all logged incidents (primarily for testing).
   */
  clearIncidents() {
    if (useFallback) {
      fallbackIncidents.length = 0;
      if (fs.existsSync(fallbackFile)) {
        try {
          fs.unlinkSync(fallbackFile);
        } catch (_) {}
      }
    } else if (db) {
      try {
        db.exec('DELETE FROM incidents');
      } catch (_) {}
    }
  }

  /**
   * Record an operational failure in the database.
   * @param {string} type 
   * @param {string} agent 
   * @param {string} provider 
   * @param {number|null} statusCode 
   * @param {string} message 
   * @param {string|null} [goalId] 
   * @returns {number}
   */
  recordIncident(type, agent, provider, statusCode, message, goalId = null) {
    if (useFallback) {
      const id = fallbackIncidents.length + 1;
      const incident = {
        id,
        workspace_id: this.workspaceId,
        project_id: this.projectId,
        timestamp: new Date().toISOString(),
        type,
        agent,
        provider,
        status_code: statusCode,
        message,
        goal_id: goalId
      };
      fallbackIncidents.push(incident);
      try {
        fs.writeFileSync(fallbackFile, JSON.stringify(fallbackIncidents, null, 2), 'utf8');
      } catch (e) {
        console.error(`[SCAR] Write fallback failed: ${e.message}`);
      }
      return id;
    }

    try {
      const stmt = db.prepare(`
        INSERT INTO incidents (workspace_id, project_id, type, agent, provider, status_code, message, goal_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(this.workspaceId, this.projectId, type, agent, provider, statusCode, message, goalId);
      return info.lastInsertRowid;
    } catch (e) {
      console.error(`[SCAR] Record incident failed: ${e.message}`);
      return -1;
    }
  }

  /**
   * Fetch recent logged failures.
   * @param {number} [limit] 
   * @returns {Array<Object>}
   */
  getRecentScars(limit = 10) {
    if (useFallback) {
      return fallbackIncidents
        .filter(inc => inc.workspace_id === this.workspaceId && inc.project_id === this.projectId)
        .slice(-limit)
        .reverse();
    }

    try {
      const stmt = db.prepare(`
        SELECT type, agent, provider, status_code as status_code, message, goal_id as goal_id, timestamp
        FROM incidents
        WHERE workspace_id = ? AND project_id = ?
        ORDER BY id DESC
        LIMIT ?
      `);
      return stmt.all(this.workspaceId, this.projectId, limit);
    } catch (e) {
      console.error(`[SCAR] Fetch scars failed: ${e.message}`);
      return [];
    }
  }

  /**
   * Scans recent failures and counts occurrences of matching signatures.
   * @param {Array<Object>} scars 
   * @returns {Array<Object>}
   */
  detectFailurePatterns(scars) {
    if (!scars || scars.length === 0) return [];
    const patternCounts = new Map();

    for (const scar of scars) {
      const message = scar.message || '';
      for (const fix of this.knownFixes) {
        if (fix.regex.test(message)) {
          const label = fix.label;
          if (!patternCounts.has(label)) {
            patternCounts.set(label, { count: 0, hint: fix.hint });
          }
          patternCounts.get(label).count += 1;
        }
      }
    }

    const repeated = [];
    for (const [label, data] of patternCounts.entries()) {
      if (data.count >= 2) {
        repeated.push({
          pattern: label,
          count: data.count,
          hint: data.hint
        });
      }
    }

    return repeated.sort((a, b) => b.count - a.count);
  }

  /**
   * Inject warning blocks if identical failures repeat.
   * @param {string} prompt 
   * @param {Array<Object>} scars 
   * @returns {string}
   */
  injectRepeatGuard(prompt, scars) {
    const repeated = this.detectFailurePatterns(scars);
    if (repeated.length === 0) return prompt;

    let warningBlock = '\n\n### !!! REPEAT FAILURE GUARD — DO NOT REPEAT THESE ERRORS !!!\n';
    warningBlock += 'The following errors have occurred MULTIPLE times in this session. Prioritize fixing them:\n\n';

    for (const p of repeated) {
      warningBlock += `▶ Pattern: ${p.pattern} (Failed ${p.count} times)\n`;
      warningBlock += `  Fix Instruction: ${p.hint}\n\n`;
    }

    warningBlock += '### !!! END REPEAT FAILURE GUARD !!!\n\n';
    return warningBlock + prompt;
  }
}
