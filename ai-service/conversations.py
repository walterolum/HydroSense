import sqlite3
import os
import json
from datetime import datetime
from typing import List, Dict, Optional, Any

DB_PATH = os.getenv("DB_PATH", "../server/watermonitor.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def ensure_tables_exist():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT DEFAULT 'New Chat',
                user_id INTEGER,
                role TEXT,
                district TEXT,
                category TEXT DEFAULT 'general',
                incident_id INTEGER,
                location_id INTEGER,
                summary TEXT,
                is_multi_user INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER,
                role TEXT,
                content TEXT,
                content_type TEXT DEFAULT 'text',
                file_url TEXT,
                file_type TEXT,
                file_name TEXT,
                metadata TEXT,
                tokens_used INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_decision_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                decision_type TEXT,
                input_data TEXT,
                output_data TEXT,
                confidence_score REAL DEFAULT 0,
                user_id INTEGER,
                role TEXT,
                district TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_conv ON ai_messages(conversation_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_conversations_user ON ai_conversations(user_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_conversations_updated ON ai_conversations(updated_at)
        """)
        conn.commit()
    finally:
        conn.close()


def get_conversation(conversation_id: int) -> Optional[Dict]:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM ai_conversations WHERE id = ?", (conversation_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_conversation_messages(
    conversation_id: int, limit: int = 50
) -> List[Dict]:
    conn = get_db()
    rows = conn.execute(
        """SELECT * FROM ai_messages
           WHERE conversation_id = ?
           ORDER BY id ASC LIMIT ?""",
        (conversation_id, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_message(
    conversation_id: int,
    role: str,
    content: str,
    content_type: str = "text",
    file_url: str = None,
    file_type: str = None,
    file_name: str = None,
    metadata: dict = None,
    tokens_used: int = 0,
) -> int:
    conn = get_db()
    conn.execute(
        """INSERT INTO ai_messages
           (conversation_id, role, content, content_type, file_url, file_type, file_name, metadata, tokens_used)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            conversation_id,
            role,
            content,
            content_type,
            file_url,
            file_type,
            file_name,
            json.dumps(metadata) if metadata else None,
            tokens_used,
        ),
    )
    conn.execute(
        "UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?",
        (conversation_id,),
    )
    conn.commit()
    msg_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return msg_id


def save_message_batch(conversation_id: int, messages: List[Dict]) -> int:
    conn = get_db()
    count = 0
    for msg in messages:
        conn.execute(
            """INSERT INTO ai_messages
               (conversation_id, role, content, content_type, file_url, file_type, file_name, metadata, tokens_used)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                conversation_id,
                msg.get("role", "user"),
                msg.get("content", ""),
                msg.get("content_type", "text"),
                msg.get("file_url"),
                msg.get("file_type"),
                msg.get("file_name"),
                json.dumps(msg.get("metadata")) if msg.get("metadata") else None,
                msg.get("tokens_used", 0),
            ),
        )
        count += 1
    conn.execute(
        "UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?",
        (conversation_id,),
    )
    conn.commit()
    conn.close()
    return count


def create_conversation(
    title: str,
    user_id: int,
    role: str,
    district: str = None,
    category: str = "general",
    incident_id: int = None,
    location_id: int = None,
) -> int:
    conn = get_db()
    conn.execute(
        """INSERT INTO ai_conversations
           (title, user_id, role, district, category, incident_id, location_id)
           VALUES (?,?,?,?,?,?,?)""",
        (title, user_id, role, district, category, incident_id, location_id),
    )
    conn.commit()
    conv_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return conv_id


def build_conversation_context(conversation_id: int) -> str:
    conv = get_conversation(conversation_id)
    if not conv:
        return ""
    parts = [f"Conversation: {conv['title']}"]
    parts.append(f"Category: {conv['category']}")
    if conv.get("district"):
        parts.append(f"District: {conv['district']}")
    messages = get_conversation_messages(conversation_id, 20)
    if messages:
        recent = messages[-6:]
        parts.append("Recent context:")
        for m in recent:
            prefix = "User" if m["role"] == "user" else "Assistant"
            content = m["content"][:300]
            parts.append(f"  {prefix}: {content}")
    return "\n".join(parts)


def log_decision(
    decision_type: str,
    input_data: dict,
    output_data: dict,
    confidence_score: float,
    user_id: int = None,
    role: str = None,
    district: str = None,
):
    conn = get_db()
    conn.execute(
        """INSERT INTO ai_decision_log
           (decision_type, input_data, output_data, confidence_score, user_id, role, district)
           VALUES (?,?,?,?,?,?,?)""",
        (
            decision_type,
            json.dumps(input_data) if input_data else None,
            json.dumps(output_data) if output_data else None,
            confidence_score,
            user_id,
            role,
            district,
        ),
    )
    conn.commit()
    conn.close()


def summarize_conversation(conversation_id: int) -> str:
    messages = get_conversation_messages(conversation_id, 100)
    if not messages:
        return ""
    text = "\n".join(
        f"{m['role']}: {m['content'][:200]}" for m in messages[-10:]
    )
    summary = text[:500]
    conn = get_db()
    conn.execute(
        "UPDATE ai_conversations SET summary = ?, updated_at = datetime('now') WHERE id = ?",
        (summary, conversation_id),
    )
    conn.commit()
    conn.close()
    return summary


def get_user_conversations(
    user_id: int, role: str, limit: int = 20
) -> List[Dict]:
    conn = get_db()
    rows = conn.execute(
        """SELECT c.*, u.name as user_name,
           (SELECT COUNT(*) FROM ai_messages WHERE conversation_id = c.id) as message_count,
           (SELECT content FROM ai_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_message
           FROM ai_conversations c LEFT JOIN users u ON c.user_id = u.id
           WHERE c.user_id = ? OR c.is_multi_user = 1
           ORDER BY c.updated_at DESC LIMIT ?""",
        (user_id, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_conversation_title(conversation_id: int, title: str):
    conn = get_db()
    conn.execute(
        "UPDATE ai_conversations SET title = ?, updated_at = datetime('now') WHERE id = ?",
        (title, conversation_id),
    )
    conn.commit()
    conn.close()


def delete_conversation(conversation_id: int):
    conn = get_db()
    conn.execute("DELETE FROM ai_messages WHERE conversation_id = ?", (conversation_id,))
    conn.execute("DELETE FROM ai_conversations WHERE id = ?", (conversation_id,))
    conn.commit()
    conn.close()


def get_orphaned_conversations(max_age_hours: int = 24) -> List[Dict]:
    conn = get_db()
    rows = conn.execute(
        """SELECT c.* FROM ai_conversations c
           LEFT JOIN ai_messages m ON c.id = m.conversation_id
           WHERE m.id IS NULL
           AND c.created_at < datetime('now', ?)""",
        (f'-{max_age_hours} hours',),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def cleanup_orphaned_conversations(max_age_hours: int = 24):
    orphans = get_orphaned_conversations(max_age_hours)
    for conv in orphans:
        delete_conversation(conv["id"])


def get_conversation_stats(user_id: int = None) -> Dict:
    conn = get_db()
    if user_id:
        total = conn.execute("SELECT COUNT(*) FROM ai_conversations WHERE user_id = ?", (user_id,)).fetchone()[0]
        total_msgs = conn.execute(
            "SELECT COUNT(*) FROM ai_messages m JOIN ai_conversations c ON m.conversation_id = c.id WHERE c.user_id = ?",
            (user_id,)
        ).fetchone()[0]
    else:
        total = conn.execute("SELECT COUNT(*) FROM ai_conversations").fetchone()[0]
        total_msgs = conn.execute("SELECT COUNT(*) FROM ai_messages").fetchone()[0]
    conn.close()
    return {"total_conversations": total, "total_messages": total_msgs}
