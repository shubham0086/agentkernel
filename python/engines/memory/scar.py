"""
Sovereign Critical Action Record (SCAR) database and Repeat Failure Guard.
Prevents AI agents from repeating identical errors in loops.
"""
import sqlite3
import os
import re
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class SCAR:
    """Manages SQLite incident logging and Repeat Failure Guard prompt injections."""
    
    def __init__(self, db_path: str = "data/scars.db", workspace_id: str = "default", project_id: str = "core"):
        self.db_path = db_path
        self.workspace_id = workspace_id
        self.project_id = project_id
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()
        
        # Known failure signatures and their corresponding fix instructions
        self.known_fixes = [
            {
                "regex": r"fn\.apply is not a function|route file does not export a function|liveness check failed",
                "label": "ROUTE FACTORY EXPORT",
                "hint": "Route files MUST export a factory function: `module.exports = function(app) { app.get(...) }`. NEVER export a raw Express Router."
            },
            {
                "regex": r"guardian rejection|banned call|forbidden execution",
                "label": "BANNED CALL EXHAUSTION",
                "hint": "eval(), exec(), or child_process.exec() are forbidden by security policies. Use spawn() with explicit args instead."
            },
            {
                "regex": r"path traversal|path sanitization",
                "label": "PATH TRAVERSAL ATTEMPT",
                "hint": "No `..` or absolute paths. Always relative-to-projectRoot. Validate with path.resolve + startsWith check."
            },
            {
                "regex": r"search block did not match|search.*replace.*invalid",
                "label": "INVALID SEARCH/REPLACE DIFF",
                "hint": "The SEARCH block must match the target file exactly. Double check whitespace and line endings, or use empty SEARCH blocks."
            },
            {
                "regex": r"syntax check failed|unexpected end of input|unexpected token",
                "label": "SYNTAX COMPLIANCE ERROR",
                "hint": "Output must be valid syntax. Verify braces, brackets, parentheses, and commas. Never truncate output mid-block."
            },
            {
                "regex": r"esm import|esmodule.*\.js file|cannot use import",
                "label": "ESM IMPORT IN COMMONJS",
                "hint": "This file runs in a CommonJS project. Use `const x = require(...)` and `module.exports = x`. Do NOT use `import` / `export` syntax."
            },
            {
                "regex": r"rate limit|quota exceeded|429 status",
                "label": "API RATE LIMIT TRIGGER",
                "hint": "Provider is currently rate-limited. Wait or adjust model chains to route to cheaper/local providers first."
            },
            {
                "regex": r"timeout|request exceeded \d+s",
                "label": "REQUEST TIMEOUT EXPIRED",
                "hint": "Inference took too long. Reduce output tokens size or request complexity. Check provider status."
            }
        ]

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
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
            """)
            conn.commit()

    def record_incident(
        self,
        incident_type: str,
        agent: str,
        provider: str,
        status_code: Optional[int],
        message: str,
        goal_id: Optional[str] = None
    ) -> int:
        """Record an operational failure in the database."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO incidents (workspace_id, project_id, type, agent, provider, status_code, message, goal_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (self.workspace_id, self.project_id, incident_type, agent, provider, status_code, message, goal_id)
                )
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error(f"Failed to record incident to SCAR: {e}")
            return -1

    def get_recent_scars(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Fetch recent logged failures for the current workspace & project."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT type, agent, provider, status_code, message, goal_id, timestamp
                    FROM incidents
                    WHERE workspace_id = ? AND project_id = ?
                    ORDER BY id DESC
                    LIMIT ?
                    """,
                    (self.workspace_id, self.project_id, limit)
                )
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Failed to fetch scars: {e}")
            return []

    def detect_failure_patterns(self, scars: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Scans recent failures and counts occurrences of matching signatures."""
        if not scars:
            return []
            
        pattern_counts = {}
        for scar in scars:
            message = scar.get("message", "")
            for fix in self.known_fixes:
                if re.search(fix["regex"], message, re.IGNORECASE):
                    label = fix["label"]
                    if label not in pattern_counts:
                        pattern_counts[label] = {
                            "count": 0,
                            "hint": fix["hint"]
                        }
                    pattern_counts[label]["count"] += 1
                    
        # Filter patterns that occur >= 2 times
        repeated = []
        for label, data in pattern_counts.items():
            if data["count"] >= 2:
                repeated.append({
                    "pattern": label,
                    "count": data["count"],
                    "hint": data["hint"]
                })
                
        # Sort by most frequent first
        repeated.sort(key=lambda x: x["count"], reverse=True)
        return repeated

    def inject_repeat_guard(self, prompt: str, scars: List[Dict[str, Any]]) -> str:
        """Injects a high-priority warning block into prompts if identical failures repeat."""
        repeated_patterns = self.detect_failure_patterns(scars)
        if not repeated_patterns:
            return prompt
            
        warning_block = "\n\n### !!! REPEAT FAILURE GUARD — DO NOT REPEAT THESE ERRORS !!!\n"
        warning_block += "The following errors have occurred MULTIPLE times in this session. Prioritize fixing them:\n\n"
        
        for p in repeated_patterns:
            warning_block += f"▶ Pattern: {p['pattern']} (Failed {p['count']} times)\n"
            warning_block += f"  Fix Instruction: {p['hint']}\n\n"
            
        warning_block += "### !!! END REPEAT FAILURE GUARD !!!\n\n"
        
        # Inject the warning block right at the top of the prompt payload
        return warning_block + prompt
