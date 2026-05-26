import json
import logging
import time
from typing import List, Dict, Optional, Any
from datetime import datetime

logger = logging.getLogger("hydrosense.memory")

MAX_SHORT_TERM_TURNS = 30
MAX_LONG_TERM_KEYS = 100
COMPRESSION_THRESHOLD = 25


class ConversationMemory:
    """Structured memory system with short-term and long-term memory management.

    Short-term memory: recent conversation turns within the current session.
    Long-term memory: extracted user preferences, facts, and important context.
    """

    def __init__(self, user_id: Optional[int] = None, conversation_id: Optional[int] = None):
        self.user_id = user_id
        self.conversation_id = conversation_id
        self.short_term: List[Dict[str, str]] = []
        self.long_term: Dict[str, Any] = {}
        self.metadata: Dict[str, Any] = {
            "created_at": datetime.utcnow().isoformat(),
            "turn_count": 0,
            "topics": [],
        }

    def add_turn(self, role: str, content: str) -> None:
        self.short_term.append({
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
        })
        self.metadata["turn_count"] += 1

        self._extract_facts(content)

        if len(self.short_term) >= COMPRESSION_THRESHOLD:
            self._compress()

    def get_recent(self, n: int = 12) -> List[Dict[str, str]]:
        return self.short_term[-n:]

    def get_full_context(self) -> str:
        if not self.long_term and not self.short_term:
            return ""
        parts = []
        if self.long_term:
            facts = "; ".join(f"{k}: {v}" for k, v in self.long_term.items() if v)
            if facts:
                parts.append(f"[User Context: {facts}]")
        topics = self.metadata.get("topics", [])
        if topics:
            parts.append(f"[Conversation Topics: {', '.join(topics[-5:])}]")
        # Include last few turns as conversation flow
        if self.short_term:
            recent = self.short_term[-4:]
            flow = " | ".join(f"{t['role']}: {t['content'][:100]}" for t in recent)
            parts.append(f"[Recent: {flow}]")
        return "\n".join(parts)

    def to_history(self) -> List[Dict[str, str]]:
        return [{"role": t["role"], "content": t["content"]} for t in self.short_term]

    def _extract_facts(self, content: str) -> None:
        content_lower = content.lower()
        # Extract user-provided facts from conversation
        fact_patterns = {
            "district": r"(?:i (?:am|live|work|based) in|my district is) (\w+)",
            "name": r"(?:my name is|i'm |i am |call me )(\w+(?:\s+\w+)?)",
            "role": r"(?:i am (?:a|an) |my role is )(\w+(?:\s+\w+)?)",
            "organization": r"(?:i work (?:for|at) |my organization is )(\w+(?:\s+\w+)?)",
        }
        import re
        for key, pattern in fact_patterns.items():
            match = re.search(pattern, content_lower)
            if match and key not in self.long_term:
                self.long_term[key] = match.group(1).strip()
                if len(self.long_term) > MAX_LONG_TERM_KEYS:
                    oldest = next(iter(self.long_term))
                    del self.long_term[oldest]

    def _compress(self) -> None:
        old_turns = self.short_term[:-10]
        if old_turns:
            summary_parts = []
            for t in old_turns:
                summary_parts.append(f"{t['role']}: {t['content'][:80]}")
            self.metadata["compressed_history"] = " | ".join(summary_parts)
        self.short_term = self.short_term[-10:]

    def add_topic(self, topic: str) -> None:
        topics = self.metadata["topics"]
        if topic not in topics:
            topics.append(topic)
            if len(topics) > 20:
                topics.pop(0)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "conversation_id": self.conversation_id,
            "short_term_count": len(self.short_term),
            "long_term": self.long_term,
            "metadata": self.metadata,
        }


class MemoryManager:
    """Manages conversation memory across all users and sessions."""

    def __init__(self):
        self._sessions: Dict[str, ConversationMemory] = {}
        self._max_sessions = 1000

    def get_or_create(self, session_id: str, user_id: Optional[int] = None,
                      conversation_id: Optional[int] = None) -> ConversationMemory:
        if session_id not in self._sessions:
            if len(self._sessions) >= self._max_sessions:
                oldest = next(iter(self._sessions))
                del self._sessions[oldest]
            self._sessions[session_id] = ConversationMemory(
                user_id=user_id, conversation_id=conversation_id
            )
        return self._sessions[session_id]

    def get(self, session_id: str) -> Optional[ConversationMemory]:
        return self._sessions.get(session_id)

    def add_turn(self, session_id: str, role: str, content: str) -> None:
        mem = self.get(session_id)
        if mem:
            mem.add_turn(role, content)

    def cleanup_old_sessions(self, max_age_hours: int = 24) -> int:
        now = time.time()
        cutoff = now - (max_age_hours * 3600)
        expired = []
        for sid, mem in self._sessions.items():
            try:
                created = datetime.fromisoformat(mem.metadata["created_at"]).timestamp()
                if created < cutoff:
                    expired.append(sid)
            except (ValueError, KeyError):
                expired.append(sid)
        for sid in expired:
            del self._sessions[sid]
        return len(expired)


memory_manager = MemoryManager()
