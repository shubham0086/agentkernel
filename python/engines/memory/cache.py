"""
SQLite-based response caching to save token costs.
Keyed by SHA-256(system_prompt + prompt).
"""
import sqlite3
import os
import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)

class ResponseCache:
    """Manages SQLite cache for prompt responses."""
    
    def __init__(self, db_path: str = "data/cache.db"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS prompt_cache (
                    key TEXT PRIMARY KEY,
                    response TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()

    @staticmethod
    def calculate_key(system_prompt: str, prompt: str) -> str:
        """Calculate SHA-256 key for prompts."""
        raw = f"{system_prompt}\x00{prompt}".encode("utf-8")
        return hashlib.sha256(raw).hexdigest()

    def get(self, system_prompt: str, prompt: str) -> Optional[str]:
        """Fetch cached response, returns None if not found."""
        key = self.calculate_key(system_prompt, prompt)
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT response FROM prompt_cache WHERE key = ?", (key,))
                row = cursor.fetchone()
                if row:
                    logger.debug("Cache hit for LLM response")
                    return row[0]
        except Exception as e:
            logger.error(f"Failed to read from cache: {e}")
        return None

    def set(self, system_prompt: str, prompt: str, response: str) -> None:
        """Cache a prompt response."""
        key = self.calculate_key(system_prompt, prompt)
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO prompt_cache (key, response) VALUES (?, ?)",
                    (key, response)
                )
                conn.commit()
                logger.debug("LLM response cached successfully")
        except Exception as e:
            logger.error(f"Failed to write to cache: {e}")
