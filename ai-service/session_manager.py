"""
HydroSense AI — Session & Context Management
Token-aware context window, automatic compression, session persistence,
and conversation thread management.
"""

import json
import time
import logging
import hashlib
import asyncio
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime
from dataclasses import dataclass, field

from pg_db import get_db, put_db, transform_sql

logger = logging.getLogger("hydrosense.session_manager")

TOKEN_ESTIMATE_RATIO = 4.0  # ~4 chars per token
MAX_CONTEXT_TOKENS = 32000
COMPRESSION_THRESHOLD_TOKENS = 24000
SHORT_TERM_TURNS = 12


@dataclass
class SessionState:
    user_id: int
    session_id: str
    role: str = "citizen"
    district: Optional[str] = None
    language: str = "en"
    created_at: float = 0.0
    last_active: float = 0.0
    turn_count: int = 0
    total_tokens_estimate: int = 0
    compressed_history: List[Dict] = field(default_factory=list)
    topics: List[str] = field(default_factory=list)
    is_compressed: bool = False
    metadata: Dict = field(default_factory=dict)


def estimate_tokens(text: str) -> int:
    return int(len(text) / TOKEN_ESTIMATE_RATIO) + 1


class SessionManager:
    """Manages AI sessions with token-aware context windowing."""

    def __init__(self, max_sessions: int = 5000, session_ttl_hours: int = 72):
        self.max_sessions = max_sessions
        self.session_ttl_hours = session_ttl_hours
        self._sessions: Dict[str, SessionState] = {}
        self._persistence_enabled = True

    def _session_key(self, user_id: int, session_id: str) -> str:
        return f"{user_id}:{session_id}"

    def get_or_create(self, user_id: int, session_id: str, role: str = "citizen",
                      district: Optional[str] = None, language: str = "en") -> SessionState:
        key = self._session_key(user_id, session_id)
        if key in self._sessions:
            return self._sessions[key]
        if len(self._sessions) >= self.max_sessions:
            oldest = min(self._sessions.keys(), key=lambda k: self._sessions[k].last_active)
            self._persist_session(self._sessions[oldest])
            del self._sessions[oldest]
        now = time.time()
        state = SessionState(
            user_id=user_id,
            session_id=session_id,
            role=role,
            district=district,
            language=language,
            created_at=now,
            last_active=now,
        )
        stored = self._load_session(key)
        if stored:
            state.compressed_history = stored.get("compressed_history", [])
            state.topics = stored.get("topics", [])
            state.total_tokens_estimate = stored.get("total_tokens", 0)
            state.turn_count = stored.get("turn_count", 0)
            state.metadata = stored.get("metadata", {})
            logger.info(f"Loaded persisted session {key}: {state.turn_count} turns")
        self._sessions[key] = state
        return state

    def add_turn(self, user_id: int, session_id: str, role: str, content: str):
        key = self._session_key(user_id, session_id)
        state = self._sessions.get(key)
        if not state:
            return
        state.last_active = time.time()
        state.turn_count += 1
        state.total_tokens_estimate += estimate_tokens(content)
        topic = self._extract_topic(content)
        if topic and (not state.topics or state.topics[-1] != topic):
            state.topics.append(topic)
            if len(state.topics) > 20:
                state.topics.pop(0)
        if state.total_tokens_estimate >= COMPRESSION_THRESHOLD_TOKENS and not state.is_compressed:
            self._compress(state)

    def get_context(self, user_id: int, session_id: str, recent_turns: List[Dict]) -> str:
        key = self._session_key(user_id, session_id)
        state = self._sessions.get(key)
        if not state:
            return ""
        parts = []
        if state.compressed_history:
            summary = state.compressed_history[-1].get("summary", "") if state.compressed_history else ""
            if summary:
                parts.append(f"[Session Context: {summary}]")
        if state.topics:
            topics_str = ", ".join(state.topics[-8:])
            parts.append(f"[Topics Discussed: {topics_str}]")
        if state.turn_count > 0:
            parts.append(f"[This is turn {state.turn_count + 1} of this session]")
        context = "\n".join(parts)
        token_count = estimate_tokens(context)
        max_allowed = MAX_CONTEXT_TOKENS - state.total_tokens_estimate
        if token_count > max_allowed and max_allowed > 0:
            ratio = max_allowed / token_count
            if state.compressed_history:
                last = state.compressed_history[-1]
                trunc_len = int(len(last.get("summary", "")) * ratio)
                last["summary"] = last["summary"][:trunc_len] + "..."
                context = "\n".join(parts)
        return context

    def _compress(self, state: SessionState):
        summary_parts = []
        topics_str = ", ".join(state.topics[-5:]) if state.topics else "general"
        summary_parts.append(f"Session covering {state.turn_count} turns on topics: {topics_str}")
        summary = " | ".join(summary_parts)
        state.compressed_history.append({
            "summary": summary,
            "compressed_at": time.time(),
            "turns_at_compression": state.turn_count,
        })
        state.is_compressed = True
        state.total_tokens_estimate = estimate_tokens(summary) + SHORT_TERM_TURNS * 50
        if len(state.compressed_history) > 5:
            state.compressed_history = state.compressed_history[-3:]
        logger.info(f"Session {state.session_id} compressed at turn {state.turn_count}")

    def _extract_topic(self, content: str) -> Optional[str]:
        topic_keywords = {
            "water point": "water_points",
            "borehole": "water_points",
            "sensor": "sensors",
            "iot": "sensors",
            "maintenance": "maintenance",
            "repair": "maintenance",
            "quality": "water_quality",
            "contamination": "water_quality",
            "drought": "climate",
            "rainfall": "climate",
            "flood": "climate",
            "health": "health",
            "disease": "health",
            "cholera": "health",
            "budget": "budget",
            "fund": "budget",
            "governance": "governance",
            "committee": "governance",
            "report": "reporting",
            "alert": "alerts",
            "emergency": "alerts",
            "district": "districts",
            "community": "community",
            "prediction": "predictions",
            "forecast": "predictions",
        }
        content_lower = content.lower()
        for keyword, topic in topic_keywords.items():
            if keyword in content_lower:
                return topic
        return None

    def _persist_session(self, state: SessionState):
        if not self._persistence_enabled:
            return
        try:
            conn = get_db()
            try:
                conn.execute(transform_sql("""
                    INSERT INTO ai_session_state
                    (user_id, session_id, compressed_history, topics,
                     turn_count, total_tokens, metadata, expires_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s, NOW() + INTERVAL '%s hours')
                    ON CONFLICT (user_id, session_id)
                    DO UPDATE SET
                        compressed_history = EXCLUDED.compressed_history,
                        topics = EXCLUDED.topics,
                        turn_count = EXCLUDED.turn_count,
                        total_tokens = EXCLUDED.total_tokens,
                        metadata = EXCLUDED.metadata,
                        expires_at = NOW() + INTERVAL '%s hours'
                """), (
                    state.user_id,
                    state.session_id,
                    json.dumps(state.compressed_history),
                    ",".join(state.topics),
                    state.turn_count,
                    state.total_tokens_estimate,
                    json.dumps(state.metadata),
                    self.session_ttl_hours,
                    self.session_ttl_hours,
                ))
                conn.commit()
            except Exception:
                conn.rollback()
            finally:
                put_db(conn)
        except Exception as e:
            logger.warning(f"Failed to persist session {state.session_id}: {e}")

    def _load_session(self, key: str) -> Optional[Dict]:
        try:
            user_id_str, session_id = key.split(":", 1)
            user_id = int(user_id_str)
            conn = get_db()
            try:
                row = conn.execute(transform_sql("""
                    SELECT * FROM ai_session_state
                    WHERE user_id = %s AND session_id = %s AND expires_at > NOW()
                """), (user_id, session_id)).fetchone()
                if row:
                    data = dict(row)
                    data["compressed_history"] = json.loads(data.get("compressed_history", "[]"))
                    data["topics"] = data.get("topics", "").split(",") if data.get("topics") else []
                    data["metadata"] = json.loads(data.get("metadata", "{}")) if data.get("metadata") else {}
                    return data
                return None
            finally:
                put_db(conn)
        except Exception as e:
            logger.warning(f"Failed to load session {key}: {e}")
            return None

    def save_state(self, user_id: int, session_id: str):
        key = self._session_key(user_id, session_id)
        state = self._sessions.get(key)
        if state:
            self._persist_session(state)

    def delete_session(self, user_id: int, session_id: str):
        key = self._session_key(user_id, session_id)
        self._sessions.pop(key, None)
        try:
            conn = get_db()
            try:
                conn.execute(transform_sql(
                    "DELETE FROM ai_session_state WHERE user_id = %s AND session_id = %s"
                ), (user_id, session_id))
                conn.commit()
            except Exception:
                conn.rollback()
            finally:
                put_db(conn)
        except Exception:
            pass

    def cleanup_expired(self) -> int:
        count = 0
        now = time.time()
        expired = []
        for key, state in self._sessions.items():
            if now - state.last_active > self.session_ttl_hours * 3600:
                self._persist_session(state)
                expired.append(key)
        for key in expired:
            del self._sessions[key]
            count += 1
        try:
            conn = get_db()
            try:
                conn.execute(transform_sql("DELETE FROM ai_session_state WHERE expires_at < NOW()"))
                conn.commit()
            except Exception:
                conn.rollback()
            finally:
                put_db(conn)
        except Exception:
            pass
        if count:
            logger.info(f"Cleaned up {count} expired sessions")
        return count


session_manager = SessionManager()
