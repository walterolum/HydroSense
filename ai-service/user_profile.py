"""
HydroSense AI — Adaptive User Profiling & Personalization
Learns user preferences, language, expertise level, frequent topics,
and adapts tone and complexity over time.
"""

import json
import logging
import re
import math
from typing import Dict, Optional, Any, List
from datetime import datetime, timezone

from pg_db import get_db, put_db, transform_sql
from user_memory import user_memory

logger = logging.getLogger("hydrosense.user_profile")


EXPERTISE_LEVELS = {
    "beginner": "Simple explanations with minimal jargon. Focus on practical steps and clear guidance.",
    "intermediate": "Balanced explanations with technical terms explained. Includes data and context.",
    "advanced": "Technical depth with domain terminology. Raw data, analytics, and detailed methodology.",
    "expert": "Professional-grade analysis with full technical depth. Raw queries, APIs, system internals.",
}

COMMUNICATION_STYLES = {
    "concise": "Short, direct responses. Bullet points and summaries preferred.",
    "balanced": "Moderate length with clear structure. Mix of summary and detail.",
    "detailed": "Comprehensive, thorough responses. Full context, examples, and explanations.",
    "conversational": "Friendly, engaging tone. Uses analogies, questions, and natural flow.",
}


def ensure_profile_table():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_user_profiles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
                inferred_name TEXT,
                inferred_district TEXT,
                inferred_role TEXT,
                preferred_language TEXT DEFAULT 'en',
                expertise_level TEXT DEFAULT 'intermediate',
                communication_style TEXT DEFAULT 'balanced',
                frequent_topics TEXT DEFAULT '[]',
                total_conversations INTEGER DEFAULT 0,
                total_messages INTEGER DEFAULT 0,
                avg_message_length REAL DEFAULT 0.0,
                active_days INTEGER DEFAULT 0,
                last_active_date DATE,
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        conn.commit()
        logger.info("User profiles table ensured")
    except Exception as e:
        logger.error(f"Failed to create profiles table: {e}")
        conn.rollback()
    finally:
        put_db(conn)


class UserProfileEngine:
    """Builds and maintains adaptive user profiles."""

    def __init__(self):
        self._cache: Dict[int, Dict] = {}
        self._cache_ttl = 300.0
        self._cache_timestamps: Dict[int, float] = {}

    def _is_cached(self, user_id: int) -> bool:
        if user_id not in self._cache:
            return False
        return (time.time() - self._cache_timestamps.get(user_id, 0)) < self._cache_ttl

    def get_profile(self, user_id: int) -> Dict:
        if self._is_cached(user_id):
            return self._cache[user_id]
        conn = get_db()
        try:
            row = conn.execute(transform_sql(
                "SELECT * FROM ai_user_profiles WHERE user_id = %s"
            ), (user_id,)).fetchone()
            if row:
                profile = dict(row)
                profile["frequent_topics"] = json.loads(profile.get("frequent_topics", "[]"))
                profile["metadata"] = json.loads(profile.get("metadata", "{}"))
            else:
                profile = self._create_default(user_id, conn)
            self._cache[user_id] = profile
            self._cache_timestamps[user_id] = time.time()
            return profile
        finally:
            put_db(conn)

    def _create_default(self, user_id: int, conn) -> Dict:
        base_role = self._infer_role_from_db(user_id, conn)
        profile = {
            "user_id": user_id,
            "preferred_language": "en",
            "expertise_level": "intermediate",
            "communication_style": "balanced",
            "frequent_topics": [],
            "total_conversations": 0,
            "total_messages": 0,
            "avg_message_length": 0.0,
            "active_days": 0,
            "metadata": {},
        }
        if base_role:
            profile["inferred_role"] = base_role
        return profile

    def _infer_role_from_db(self, user_id: int, conn) -> Optional[str]:
        try:
            row = conn.execute(transform_sql(
                "SELECT role FROM users WHERE id = %s"
            ), (user_id,)).fetchone()
            return row["role"] if row else None
        except Exception:
            return None

    def update_from_message(self, user_id: int, message: str) -> Dict:
        profile = self.get_profile(user_id)
        old_expertise = profile.get("expertise_level", "intermediate")
        old_style = profile.get("communication_style", "balanced")

        self._extract_preferences(user_id, message, profile)
        self._update_expertise(user_id, message, profile)
        self._update_style(user_id, message, profile)
        self._update_topics(user_id, message, profile)
        self._update_metrics(user_id, message, profile)

        if (profile.get("expertise_level") != old_expertise or
            profile.get("communication_style") != old_style):
            self._persist_profile(user_id, profile)
            logger.info(f"Profile updated for user {user_id}: expertise={old_expertise}->{profile['expertise_level']}, style={old_style}->{profile['communication_style']}")

        if user_id in self._cache:
            self._cache[user_id] = profile
            self._cache_timestamps[user_id] = time.time()

        return profile

    def _extract_preferences(self, user_id: int, message: str, profile: Dict):
        msg_lower = message.lower()

        lang_patterns = {
            "lug": r"\b(oledde|ssebo|nyabo|katonda|kya)",
            "swa": r"\b(jambo|habari|asante|tafadhali|sawa)",
            "luo": r"\b(bera|nyako|wuoro|mit|ber)",
            "ach": r"\b(oti|iyo|kono|mapol)",
        }
        for code, pattern in lang_patterns.items():
            if re.search(pattern, msg_lower):
                if profile.get("preferred_language", "en") != code:
                    profile["preferred_language"] = code
                    user_memory.set_fact(user_id, "language", code, "preference", 0.8, "detected")

    def _update_expertise(self, user_id: int, message: str, profile: Dict):
        msg_lower = message.lower()

        advanced_indicators = [
            r"\b(standard deviation|correlation|regression|p.value|confidence interval)\b",
            r"\b(normalize|aggregate|dimensionality|convolution|transformer)\b",
            r"\b(infrastructure.score|water_safety_score|risk_metrics|anomaly_score)\b",
            r"\b(beneficiaries|functionality.rate|coverage|per.capita)\b",
            r"\b(SQL|query|API|endpoint|schema|migration|deployment)\b",
            r"\b(calibrate|tolerance|precision|throughput|latency|bandwidth)\b",
        ]

        basic_indicators = [
            r"\b(how do I|what is|help me|can you show|where is|how to)\b",
            r"\b(confused|difficult|understand|explain|simple|easy)\b",
            r"\b(water|borehole|pump|tap|pipe)\b",
            r"\b(problem|issue|broken|not working|fix)\b",
        ]

        advanced_score = sum(1 for p in advanced_indicators if re.search(p, msg_lower))
        basic_score = sum(1 for p in basic_indicators if re.search(p, msg_lower))

        current_level = profile.get("expertise_level", "intermediate")
        levels = ["beginner", "intermediate", "advanced", "expert"]
        current_idx = levels.index(current_level) if current_level in levels else 1

        if advanced_score >= 2:
            new_idx = min(current_idx + 1, 3)
        elif basic_score >= 2 and current_idx > 0:
            new_idx = max(current_idx - 1, 0)
        else:
            new_idx = current_idx

        profile["expertise_level"] = levels[new_idx]
        user_memory.set_fact(user_id, "expertise", levels[new_idx], "preference", 0.6, "inferred")

    def _update_style(self, user_id: int, message: str, profile: Dict):
        words = message.split()
        word_count = len(words)

        has_question = "?" in message
        has_bullets = "\n- " in message or "\n* " in message
        has_code = "```" in message or "`" in message

        current_style = profile.get("communication_style", "balanced")

        if word_count < 5:
            profile["communication_style"] = "concise"
        elif has_bullets or has_code:
            profile["communication_style"] = "detailed"
        elif has_question and word_count > 15:
            profile["communication_style"] = "conversational"
        else:
            profile["communication_style"] = current_style

        user_memory.set_fact(user_id, "communication_style", profile["communication_style"], "preference", 0.5, "inferred")

    def _update_topics(self, user_id: int, message: str, profile: Dict):
        topic_keywords = {
            "water_points": ["water point", "borehole", "well", "spring", "pump", "tap"],
            "sensors": ["sensor", "iot", "reading", "battery", "signal", "data stream"],
            "maintenance": ["maintenance", "repair", "broken", "fix", "technician", "spare"],
            "water_quality": ["quality", "contamination", "ph", "turbidity", "e.coli", "safe"],
            "climate": ["drought", "rainfall", "flood", "climate", "weather", "season"],
            "health": ["health", "disease", "outbreak", "cholera", "typhoid"],
            "governance": ["governance", "budget", "committee", "fund", "allocation"],
            "alerts": ["alert", "emergency", "critical", "warning"],
            "predictions": ["predict", "forecast", "risk", "score", "probability"],
            "community": ["community", "citizen", "report", "feedback"],
        }

        msg_lower = message.lower()
        detected = set()
        for topic, keywords in topic_keywords.items():
            if any(kw in msg_lower for kw in keywords):
                detected.add(topic)

        if detected:
            existing = set(profile.get("frequent_topics", []))
            combined = existing | detected
            sorted_topics = sorted(
                combined,
                key=lambda t: msg_lower.count(t) if t in [k for k, v in topic_keywords.items() if any(kw in msg_lower for kw in v)] else 0,
                reverse=True,
            )[:10]
            profile["frequent_topics"] = sorted_topics

    def _update_metrics(self, user_id: int, message: str, profile: Dict):
        msg_len = len(message)
        total = profile.get("total_messages", 0)
        avg = profile.get("avg_message_length", 0.0)
        profile["total_messages"] = total + 1
        profile["avg_message_length"] = round(((avg * total) + msg_len) / (total + 1), 1)

        today = datetime.now(timezone.utc).date()
        if profile.get("last_active_date") != str(today):
            profile["active_days"] = profile.get("active_days", 0) + 1
        profile["last_active_date"] = str(today)

    def _persist_profile(self, user_id: int, profile: Dict):
        conn = get_db()
        try:
            conn.execute(transform_sql("""
                INSERT INTO ai_user_profiles
                (user_id, inferred_name, inferred_district, inferred_role,
                 preferred_language, expertise_level, communication_style,
                 frequent_topics, total_conversations, total_messages,
                 avg_message_length, active_days, last_active_date, metadata)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (user_id)
                DO UPDATE SET
                    inferred_name = EXCLUDED.inferred_name,
                    inferred_district = EXCLUDED.inferred_district,
                    inferred_role = EXCLUDED.inferred_role,
                    preferred_language = EXCLUDED.preferred_language,
                    expertise_level = EXCLUDED.expertise_level,
                    communication_style = EXCLUDED.communication_style,
                    frequent_topics = EXCLUDED.frequent_topics,
                    total_conversations = EXCLUDED.total_conversations,
                    total_messages = EXCLUDED.total_messages,
                    avg_message_length = EXCLUDED.avg_message_length,
                    active_days = EXCLUDED.active_days,
                    last_active_date = EXCLUDED.last_active_date,
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW()
            """), (
                user_id,
                profile.get("inferred_name"),
                profile.get("inferred_district"),
                profile.get("inferred_role"),
                profile.get("preferred_language", "en"),
                profile.get("expertise_level", "intermediate"),
                profile.get("communication_style", "balanced"),
                json.dumps(profile.get("frequent_topics", [])),
                profile.get("total_conversations", 0),
                profile.get("total_messages", 0),
                profile.get("avg_message_length", 0.0),
                profile.get("active_days", 0),
                profile.get("last_active_date"),
                json.dumps(profile.get("metadata", {})),
            ))
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to persist profile for user {user_id}: {e}")
        finally:
            put_db(conn)

    def add_system_prompt_context(self, user_id: int, current_prompt: str) -> str:
        profile = self.get_profile(user_id)
        expertise = profile.get("expertise_level", "intermediate")
        style = profile.get("communication_style", "balanced")

        expertise_guide = EXPERTISE_LEVELS.get(expertise, EXPERTISE_LEVELS["intermediate"])
        style_guide = COMMUNICATION_STYLES.get(style, COMMUNICATION_STYLES["balanced"])

        context_parts = [
            f"[Communication Guide: {expertise_guide}]",
            f"[Style Guide: {style_guide}]",
        ]
        if profile.get("preferred_language") and profile["preferred_language"] != "en":
            context_parts.append(f"[User prefers language: {profile['preferred_language']}]")
        if profile.get("frequent_topics"):
            topics_str = ", ".join(profile["frequent_topics"][:5])
            context_parts.append(f"[User frequently discusses: {topics_str}]")

        return "\n".join(context_parts) + "\n\n" + current_prompt

    def invalidate_cache(self, user_id: int):
        self._cache.pop(user_id, None)
        self._cache_timestamps.pop(user_id, None)

    def get_engagement_summary(self, user_id: int) -> Dict:
        profile = self.get_profile(user_id)
        facts = user_memory.get_memory_summary(user_id)
        return {
            "total_messages": profile.get("total_messages", 0),
            "active_days": profile.get("active_days", 0),
            "expertise_level": profile.get("expertise_level", "intermediate"),
            "frequent_topics": profile.get("frequent_topics", []),
            "preferred_language": profile.get("preferred_language", "en"),
            "memory_facts": facts.get("total_facts", 0),
            "identity": facts.get("identity", {}),
        }


profile_engine = UserProfileEngine()
ensure_profile_table()
