"""SQLite persistence layer for OpenVibe."""

import sqlite3
import json
from typing import List, Dict, Any, Optional
from src.core.config import settings

class Database:
    def __init__(self, db_path: str = "openvibe.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS phrases (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT UNIQUE,
                    content TEXT,
                    category TEXT DEFAULT 'general'
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT,
                    content TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Seed default phrases if empty
            cursor = conn.execute("SELECT COUNT(*) FROM phrases")
            if cursor.fetchone()[0] == 0:
                defaults = [
                    ("Test", "Add unit tests for the changes in this file", "quality"),
                    ("Document", "Add docstrings to all functions in this file", "quality"),
                    ("Refactor", "Refactor this code to be more concise and follow PEP8", "logic"),
                    ("Security", "Check this file for security vulnerabilities", "security")
                ]
                conn.executemany("INSERT INTO phrases (label, content, category) VALUES (?, ?, ?)", defaults)

    def get_phrases(self) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM phrases ORDER BY category, label")
            return [dict(row) for row in cursor.fetchall()]

    def add_phrase(self, label: str, content: str, category: str = 'general'):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("INSERT OR REPLACE INTO phrases (label, content, category) VALUES (?, ?, ?)",
                         (label, content, category))

    def log_history(self, msg_type: str, content: str):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("INSERT INTO history (type, content) VALUES (?, ?)", (msg_type, content))

# Global instance
db = Database()
