"""
HydroSense AI — Persistent User Memory System
PostgreSQL-backed memory that stores user facts, preferences, and embeddings
across sessions. Provides semantic recall and automatic fact extraction.
"""

import json
import re
import logging
import hashlib
from typing import List, Dict, Optional, Any
from datetime import datetime

from pg_db import get_db, put_db, transform_sql

logger = logging.getLogger("hydrosense.user_memory")


FACT_CATEGORIES = {
    "identity": ["name", "role", "organization", "location", "district", "village"],
    "preference": ["language", "theme", "expertise", "communication_style"],
    "domain": ["water_point", "sensor", "maintenance", "quality", "climate", "health"],
    "behavior": ["frequent_topic", "last_query", "query_pattern", "active_hours"],
    "system": ["community", "incident", "report", "alert", "notification"],
}


def ensure_user_memory_table():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_user_memory (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                fact_key TEXT NOT NULL,
                fact_value TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                confidence REAL DEFAULT 1.0,
                source TEXT DEFAULT 'inference',
                embedding REAL[],
                is_active INTEGER DEFAULT 1,
                access_count INTEGER DEFAULT 0,
                last_accessed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_ai_user_memory_user
            ON ai_user_memory(user_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_ai_user_memory_category
            ON ai_user_memory(user_id, category)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_ai_user_memory_key
            ON ai_user_memory(user_id, fact_key)
        """)
        conn.commit()
        logger.info("User memory table ensured")
    except Exception as e:
        logger.error(f"Failed to create user memory table: {e}")
        conn.rollback()
    finally:
        put_db(conn)


class UserMemoryStore:
    """Persistent PostgreSQL-backed memory store for each user."""

    def __init__(self, embedding_dim: int = 128):
        self.embedding_dim = embedding_dim
        self._extraction_patterns = {
            "name": re.compile(
                r"(?:my name is|i['’]m\s|i am |call me )([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"
            ),
            "district": re.compile(
                r"(?:i (?:live|work|am|based) in |my district is )(\w+(?:\s+\w+)?)"
            ),
            "role": re.compile(
                r"(?:i am (?:a|an) |my role is |i work as )(\w+(?:\s+\w+)?)"
            ),
            "organization": re.compile(
                r"(?:i work (?:for|at) |my organization is )([A-Z][A-Za-z0-9\s&]+)"
            ),
            "language": re.compile(
                r"(?:i speak |my language is |in )(\w+)",
                re.IGNORECASE,
            ),
            "phone": re.compile(
                r"(?:my phone|call me at|reach me at|my number) (\+?\d[\d\s\-]{7,15})"
            ),
        }

    # ── CRUD ──

    def set_fact(
        self,
        user_id: int,
        fact_key: str,
        fact_value: str,
        category: str = "general",
        confidence: float = 1.0,
        source: str = "inference",
    ) -> int:
        conn = get_db()
        try:
            existing = conn.execute(
                transform_sql(
                    "SELECT id FROM ai_user_memory WHERE user_id = %s AND fact_key = %s AND is_active = 1"
                ),
                (user_id, fact_key),
            ).fetchone()

            if existing:
                conn.execute(
                    transform_sql(
                        """UPDATE ai_user_memory
                           SET fact_value = %s, confidence = %s, source = %s,
                               category = %s, updated_at = NOW()
                           WHERE id = %s"""
                    ),
                    (fact_value, confidence, source, category, existing["id"]),
                )
                conn.commit()
                return existing["id"]
            else:
                cursor = conn.execute(
                    transform_sql(
                        """INSERT INTO ai_user_memory
                           (user_id, fact_key, fact_value, category, confidence, source)
                           VALUES (%s,%s,%s,%s,%s,%s)
                           RETURNING id"""
                    ),
                    (user_id, fact_key, fact_value, category, confidence, source),
                )
                mem_id = cursor.fetchone()["id"]
                conn.commit()
                return mem_id
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to set fact: {e}")
            return -1
        finally:
            put_db(conn)

    def get_fact(self, user_id: int, fact_key: str) -> Optional[Dict]:
        conn = get_db()
        try:
            row = conn.execute(
                transform_sql(
                    "SELECT * FROM ai_user_memory WHERE user_id = %s AND fact_key = %s AND is_active = 1"
                ),
                (user_id, fact_key),
            ).fetchone()
            if row:
                conn.execute(
                    transform_sql(
                        "UPDATE ai_user_memory SET access_count = access_count + 1, last_accessed_at = NOW() WHERE id = %s"
                    ),
                    (row["id"],),
                )
                conn.commit()
                return dict(row)
            return None
        finally:
            put_db(conn)

    def get_all_facts(self, user_id: int, category: Optional[str] = None) -> List[Dict]:
        conn = get_db()
        try:
            if category:
                rows = conn.execute(
                    transform_sql(
                        "SELECT * FROM ai_user_memory WHERE user_id = %s AND category = %s AND is_active = 1 ORDER BY confidence DESC, updated_at DESC"
                    ),
                    (user_id, category),
                ).fetchall()
            else:
                rows = conn.execute(
                    transform_sql(
                        "SELECT * FROM ai_user_memory WHERE user_id = %s AND is_active = 1 ORDER BY category, confidence DESC"
                    ),
                    (user_id,),
                ).fetchall()
            return [dict(r) for r in rows]
        finally:
            put_db(conn)

    def delete_fact(self, user_id: int, fact_key: str) -> bool:
        conn = get_db()
        try:
            conn.execute(
                transform_sql(
                    "UPDATE ai_user_memory SET is_active = 0 WHERE user_id = %s AND fact_key = %s"
                ),
                (user_id, fact_key),
            )
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to delete fact: {e}")
            return False
        finally:
            put_db(conn)

    # ── Fact Extraction ──

    def extract_facts_from_message(
        self, user_id: int, message: str, source: str = "conversation"
    ) -> List[Dict]:
        extracted = []
        for key, pattern in self._extraction_patterns.items():
            matches = pattern.findall(message)
            for match in matches:
                value = match.strip().title() if key in ("name", "district", "organization") else match.strip()
                confidence = 0.7 if len(value) > 2 else 0.3
                category = self._categorize_key(key)
                mem_id = self.set_fact(user_id, key, value, category, confidence, source)
                if mem_id > 0:
                    extracted.append({"fact_key": key, "fact_value": value, "id": mem_id})
                    logger.info(f"Extracted fact [{key}] = {value} for user {user_id}")
        return extracted

    def _categorize_key(self, key: str) -> str:
        for cat, keys in FACT_CATEGORIES.items():
            if key in keys:
                return cat
        return "general"

    # ── Memory Context for Prompts ──

    def build_memory_context(self, user_id: int, max_facts: int = 15) -> str:
        facts = self.get_all_facts(user_id)
        if not facts:
            return ""

        identity = []
        preferences = []
        domain = []
        behavior = []

        for f in facts[:max_facts]:
            entry = f"{f['fact_key']}: {f['fact_value']}"
            cat = f.get("category", "general")
            if cat == "identity":
                identity.append(entry)
            elif cat == "preference":
                preferences.append(entry)
            elif cat == "domain":
                domain.append(entry)
            else:
                behavior.append(entry)

        parts = []
        if identity:
            parts.append("[User Profile: " + "; ".join(identity) + "]")
        if preferences:
            parts.append("[Preferences: " + "; ".join(preferences) + "]")
        if domain:
            parts.append("[Domain Context: " + "; ".join(domain) + "]")

        return "\n".join(parts) if parts else ""

    def get_memory_summary(self, user_id: int) -> Dict:
        facts = self.get_all_facts(user_id)
        summary = {
            "total_facts": len(facts),
            "by_category": {},
            "recent": [],
            "identity": {},
        }
        for f in facts:
            cat = f.get("category", "general")
            summary["by_category"][cat] = summary["by_category"].get(cat, 0) + 1
            if f["fact_key"] in ("name", "district", "role", "organization", "language"):
                summary["identity"][f["fact_key"]] = f["fact_value"]
        recent = sorted(facts, key=lambda x: x.get("updated_at", ""), reverse=True)[:5]
        summary["recent"] = [{"key": f["fact_key"], "value": f["fact_value"], "confidence": f["confidence"]} for f in recent]
        return summary


user_memory = UserMemoryStore()
ensure_user_memory_table()
