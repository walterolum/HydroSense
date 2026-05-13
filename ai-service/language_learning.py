"""
HYDROSENSE v4.0 AI Language Learning & Dialect Tracking System
Continuously improves understanding of local dialects, regional expressions,
environmental terminology, voice accents, and community reporting patterns.
"""

import os
import json
import sqlite3
import logging
import re
from datetime import datetime
from typing import Optional, List, Dict, Any, Set
from collections import defaultdict

logger = logging.getLogger("hydrosense.learning")

DB_PATH = os.getenv("DB_PATH", "../server/watermonitor.db")

LANGUAGE_CORPUS: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
DIALECT_PATTERNS: Dict[str, Dict[str, str]] = defaultdict(dict)
ENVIRONMENTAL_TERMS_DB: Dict[str, Set[str]] = defaultdict(set)
ACCENT_PROFILES: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

REPORT_PATTERNS = {
    "water": ["amazzi", "maji", "water", "pii", "ama", "amata"],
    "broken": ["vunika", "haribika", "broken", "tyeko", "kuharibika", "kumenya", "not working", "taps"],
    "flood": ["flood", "mafuriko", "amata", "enkuba", "mvua", "submerged", "okutaba"],
    "contamination": ["contaminate", "chafu", "dirty", "brown", "smell", "taste", "okufuula", "uchafuzi"],
    "health": ["sick", "cholera", "typhoid", "diarrhea", "omulwadde", "mgonjwa", "outbreak"],
    "emergency": ["emergency", "urgent", "d'angwe", "haraka", "danger", "hatari", "immediately", "death"],
}

ENVIRONMENTAL_TERMS = [
    "borehole", "well", "spring", "tap", "pump", "pipe", "dam", "pond", "river", "stream",
    "wetland", "swamp", "catchment", "aquifer", "reservoir", "tank", "waterpoint",
    "amazzi", "enzizi", "olusege", "ekiyinja", "akaliba", "ebbomba", "omusulo",
    "maji", "bwawa", "ziwa", "mto", "kinamasi", "chanzo", "bomba",
    "pii", "aora", "ot", "laro", "soko",
]


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_tables():
    """Create language learning tables if they don't exist."""
    conn = _get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS language_corpus (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                language TEXT NOT NULL,
                term TEXT NOT NULL,
                english_equivalent TEXT,
                frequency INTEGER DEFAULT 1,
                context TEXT,
                source TEXT DEFAULT 'report',
                first_seen TEXT DEFAULT (datetime('now')),
                last_seen TEXT DEFAULT (datetime('now')),
                UNIQUE(language, term)
            );

            CREATE TABLE IF NOT EXISTS dialect_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                language TEXT NOT NULL,
                region TEXT NOT NULL,
                pattern TEXT NOT NULL,
                english_translation TEXT,
                frequency INTEGER DEFAULT 1,
                confidence REAL DEFAULT 0.5,
                first_seen TEXT DEFAULT (datetime('now')),
                last_seen TEXT DEFAULT (datetime('now')),
                UNIQUE(language, region, pattern)
            );

            CREATE TABLE IF NOT EXISTS accent_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                language TEXT NOT NULL,
                speaker_id INTEGER,
                phonetic_pattern TEXT,
                accuracy_score REAL DEFAULT 0.5,
                recordings_count INTEGER DEFAULT 0,
                last_updated TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS translation_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_text TEXT NOT NULL,
                translated_text TEXT NOT NULL,
                source_language TEXT NOT NULL,
                target_language TEXT NOT NULL,
                feedback_score INTEGER DEFAULT 0,
                corrected_translation TEXT,
                user_id INTEGER,
                reviewed INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
        conn.commit()
    except Exception as e:
        logger.warning(f"Language learning table init: {e}")
    finally:
        conn.close()


def learn_from_report(
    text: str,
    detected_language: str,
    district: str,
    category: str,
) -> Dict[str, Any]:
    """Extract and learn new terms and patterns from a citizen report."""
    if detected_language == "en" or detected_language == "auto":
        return {"learned": 0, "message": "Skipping English reports"}

    conn = _get_db()
    learned_terms = 0
    try:
        words = re.findall(r'\b[a-zA-Z]+\b', text.lower())
        new_words = set()

        for word in words:
            if len(word) < 3 or word in ("the", "and", "for", "are", "was", "had", "has", "but", "not", "all"):
                continue

            existing = conn.execute(
                "SELECT id, frequency FROM language_corpus WHERE language = ? AND term = ?",
                (detected_language, word),
            ).fetchone()

            if existing:
                conn.execute(
                    "UPDATE language_corpus SET frequency = frequency + 1, last_seen = datetime('now') WHERE id = ?",
                    (existing["id"],),
                )
            else:
                eng_equiv = _guess_english_equivalent(word, category)
                context = _extract_context(text, word)
                conn.execute("""
                    INSERT OR IGNORE INTO language_corpus
                        (language, term, english_equivalent, context, source)
                    VALUES (?, ?, ?, ?, 'report')
                """, (detected_language, word, eng_equiv, context))
                new_words.add(word)
                learned_terms += 1

        if district:
            for word in new_words:
                try:
                    conn.execute("""
                        INSERT OR IGNORE INTO dialect_patterns
                            (language, region, pattern, confidence)
                        VALUES (?, ?, ?, ?)
                    """, (detected_language, district, word, 0.6))
                except Exception:
                    pass

        conn.commit()

        if learned_terms > 0:
            logger.info(f"Learned {learned_terms} new term(s) from {detected_language} report in {district}")

        return {
            "learned": learned_terms,
            "new_terms": list(new_words),
            "language": detected_language,
            "district": district,
        }
    except Exception as e:
        logger.error(f"Language learning error: {e}")
        return {"learned": 0, "error": str(e)}
    finally:
        conn.close()


def _extract_context(text: str, word: str) -> str:
    """Extract surrounding context for a word."""
    parts = text.lower().split()
    try:
        idx = parts.index(word)
        start = max(0, idx - 3)
        end = min(len(parts), idx + 4)
        return " ".join(parts[start:end])
    except ValueError:
        return ""


def _guess_english_equivalent(word: str, category: str) -> str:
    """Guess English equivalent based on category and common patterns."""
    category_terms = {
        "water_contamination": {"amazzi": "water", "chafu": "dirty", "uchafuzi": "pollution"},
        "broken_water_point": {"bomba": "pipe/tap", "kuharibika": "broken", "ebbenne": "broken"},
        "flooding": {"mafuriko": "flood", "amata": "flood", "enkuba": "rain", "mvua": "rain"},
        "sewage_leak": {"taka": "waste", "ekivundu": "sewage", "odeni": "waste"},
        "illegal_dumping": {"taka": "trash", "okuteguka": "illegal"},
        "pollution": {"uchafuzi": "pollution", "okufuula": "pollute"},
        "environmental_hazard": {"hatari": "danger", "akabi": "hazard"},
        "infrastructure_damage": {"kuharibika": "damage", "okusenyuka": "collapse"},
    }

    words_terms = category_terms.get(category, {})
    if word in words_terms:
        return words_terms[word]

    common = {
        "oli": "you are", "ali": "he/she is", "bali": "they are",
        "nsaasira": "help", "msaada": "help", "taabu": "problem",
        "kabi": "bad", "mbaya": "bad", "kali": "severe",
        "d'angwe": "emergency", "d'awol": "urgent", "haraka": "urgent",
    }
    return common.get(word, "")


def record_translation_feedback(
    original_text: str,
    translated_text: str,
    source_language: str,
    target_language: str,
    feedback_score: int,
    corrected_translation: Optional[str] = None,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Record user feedback on translation quality."""
    conn = _get_db()
    try:
        conn.execute("""
            INSERT INTO translation_feedback
                (original_text, translated_text, source_language, target_language,
                 feedback_score, corrected_translation, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            original_text[:500], translated_text[:500],
            source_language, target_language,
            max(-5, min(5, feedback_score)),
            corrected_translation[:1000] if corrected_translation else None,
            user_id,
        ))
        conn.commit()
        return {"success": True}
    finally:
        conn.close()


def get_language_stats() -> Dict[str, Any]:
    """Get statistics about learned languages and terms."""
    conn = _get_db()
    try:
        total_terms = conn.execute("SELECT COUNT(*) as c FROM language_corpus").fetchone()["c"]
        terms_by_lang = conn.execute(
            "SELECT language, COUNT(*) as c FROM language_corpus GROUP BY language ORDER BY c DESC"
        ).fetchall()
        total_patterns = conn.execute("SELECT COUNT(*) as c FROM dialect_patterns").fetchone()["c"]
        total_feedback = conn.execute("SELECT COUNT(*) as c FROM translation_feedback").fetchone()["c"]
        avg_feedback = conn.execute(
            "SELECT AVG(feedback_score) as avg FROM translation_feedback"
        ).fetchone()["avg"] or 0

        top_terms = conn.execute("""
            SELECT language, term, english_equivalent, frequency
            FROM language_corpus ORDER BY frequency DESC LIMIT 20
        """).fetchall()

        return {
            "total_terms_learned": total_terms,
            "terms_by_language": {r["language"]: r["c"] for r in terms_by_lang},
            "total_dialect_patterns": total_patterns,
            "total_feedback_records": total_feedback,
            "average_feedback_score": round(avg_feedback, 2),
            "top_terms": [dict(r) for r in top_terms],
        }
    finally:
        conn.close()


def suggest_translation(text: str, source_language: str) -> Optional[str]:
    """Look up a term in the learned language corpus."""
    conn = _get_db()
    try:
        text_lower = text.lower().strip()
        result = conn.execute(
            "SELECT english_equivalent FROM language_corpus WHERE language = ? AND term = ?",
            (source_language, text_lower),
        ).fetchone()
        if result and result["english_equivalent"]:
            return result["english_equivalent"]
        return None
    finally:
        conn.close()


def get_region_dialects(district: str) -> List[Dict[str, Any]]:
    """Get known dialect patterns for a specific region."""
    conn = _get_db()
    try:
        patterns = conn.execute("""
            SELECT language, pattern, english_translation, frequency, confidence
            FROM dialect_patterns WHERE region = ?
            ORDER BY frequency DESC LIMIT 50
        """, (district,)).fetchall()
        return [dict(p) for p in patterns]
    finally:
        conn.close()


init_tables()
