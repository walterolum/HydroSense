"""
HydroSense AI Service — AI Conversation & Decision Logging (PostgreSQL)
Replaces direct sqlite3 usage with psycopg2 via the pg_db module.
"""

import os
import json
from datetime import datetime
from typing import List, Dict, Optional, Any

from pg_db import get_db, put_db, transform_sql, rows_to_dicts, init_schema_if_needed


def ensure_tables_exist():
    conn = get_db()
    try:
        init_schema_if_needed(conn)
        conn.commit()
    finally:
        put_db(conn)


def get_conversation(conversation_id: int) -> Optional[Dict]:
    conn = get_db()
    try:
        row = conn.execute(transform_sql(
            "SELECT * FROM ai_conversations WHERE id = %s"
        ), (conversation_id,)).fetchone()
        return dict(row) if row else None
    finally:
        put_db(conn)


def get_conversation_messages(conversation_id: int, limit: int = 50) -> List[Dict]:
    conn = get_db()
    try:
        rows = conn.execute(transform_sql(
            "SELECT * FROM ai_messages WHERE conversation_id = %s ORDER BY id ASC LIMIT %s"
        ), (conversation_id, limit)).fetchall()
        return [dict(r) for r in rows]
    finally:
        put_db(conn)


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
    try:
        cursor = conn.execute(transform_sql(
            """INSERT INTO ai_messages
               (conversation_id, role, content, content_type, file_url, file_type, file_name, metadata, tokens_used)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING id"""
        ), (
            conversation_id,
            role,
            content,
            content_type,
            file_url,
            file_type,
            file_name,
            json.dumps(metadata) if metadata else None,
            tokens_used,
        ))
        msg_id = cursor.fetchone()[0]
        conn.execute(transform_sql(
            "UPDATE ai_conversations SET updated_at = NOW() WHERE id = %s"
        ), (conversation_id,))
        conn.commit()
        return msg_id
    finally:
        put_db(conn)


def save_message_batch(conversation_id: int, messages: List[Dict]) -> int:
    conn = get_db()
    try:
        count = 0
        for msg in messages:
            conn.execute(transform_sql(
                """INSERT INTO ai_messages
                   (conversation_id, role, content, content_type, file_url, file_type, file_name, metadata, tokens_used)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)"""
            ), (
                conversation_id,
                msg.get("role", "user"),
                msg.get("content", ""),
                msg.get("content_type", "text"),
                msg.get("file_url"),
                msg.get("file_type"),
                msg.get("file_name"),
                json.dumps(msg.get("metadata")) if msg.get("metadata") else None,
                msg.get("tokens_used", 0),
            ))
            count += 1
        conn.execute(transform_sql(
            "UPDATE ai_conversations SET updated_at = NOW() WHERE id = %s"
        ), (conversation_id,))
        conn.commit()
        return count
    finally:
        put_db(conn)


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
    try:
        cursor = conn.execute(transform_sql(
            """INSERT INTO ai_conversations
               (title, user_id, role, district, category, incident_id, location_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s)
               RETURNING id"""
        ), (title, user_id, role, district, category, incident_id, location_id))
        conv_id = cursor.fetchone()[0]
        conn.commit()
        return conv_id
    finally:
        put_db(conn)


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
    try:
        conn.execute(transform_sql(
            """INSERT INTO ai_decision_log
               (decision_type, input_data, output_data, confidence_score, user_id, role, district)
               VALUES (%s,%s,%s,%s,%s,%s,%s)"""
        ), (
            decision_type,
            json.dumps(input_data) if input_data else None,
            json.dumps(output_data) if output_data else None,
            confidence_score,
            user_id,
            role,
            district,
        ))
        conn.commit()
    finally:
        put_db(conn)


def summarize_conversation(conversation_id: int) -> str:
    messages = get_conversation_messages(conversation_id, 100)
    if not messages:
        return ""
    text = "\n".join(
        f"{m['role']}: {m['content'][:200]}" for m in messages[-10:]
    )
    summary = text[:500]
    conn = get_db()
    try:
        conn.execute(transform_sql(
            "UPDATE ai_conversations SET summary = %s, updated_at = NOW() WHERE id = %s"
        ), (summary, conversation_id))
        conn.commit()
    finally:
        put_db(conn)
    return summary


def get_user_conversations(user_id: int, role: str, limit: int = 20) -> List[Dict]:
    conn = get_db()
    try:
        rows = conn.execute(transform_sql(
            """SELECT c.*, u.name as user_name,
               (SELECT COUNT(*) FROM ai_messages WHERE conversation_id = c.id) as message_count,
               (SELECT content FROM ai_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_message
               FROM ai_conversations c LEFT JOIN users u ON c.user_id = u.id
               WHERE c.user_id = %s OR c.is_multi_user = 1
               ORDER BY c.updated_at DESC LIMIT %s"""
        ), (user_id, limit)).fetchall()
        return [dict(r) for r in rows]
    finally:
        put_db(conn)


def update_conversation_title(conversation_id: int, title: str):
    conn = get_db()
    try:
        conn.execute(transform_sql(
            "UPDATE ai_conversations SET title = %s, updated_at = NOW() WHERE id = %s"
        ), (title, conversation_id))
        conn.commit()
    finally:
        put_db(conn)


def delete_conversation(conversation_id: int):
    conn = get_db()
    try:
        conn.execute(transform_sql(
            "DELETE FROM ai_messages WHERE conversation_id = %s"
        ), (conversation_id,))
        conn.execute(transform_sql(
            "DELETE FROM ai_conversations WHERE id = %s"
        ), (conversation_id,))
        conn.commit()
    finally:
        put_db(conn)


def get_orphaned_conversations(max_age_hours: int = 24) -> List[Dict]:
    conn = get_db()
    try:
        rows = conn.execute(transform_sql(
            """SELECT c.* FROM ai_conversations c
               LEFT JOIN ai_messages m ON c.id = m.conversation_id
               WHERE m.id IS NULL
               AND c.created_at < NOW() - INTERVAL '%s hours'"""
        ), (max_age_hours,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        put_db(conn)


def cleanup_orphaned_conversations(max_age_hours: int = 24):
    orphans = get_orphaned_conversations(max_age_hours)
    for conv in orphans:
        delete_conversation(conv["id"])


def get_conversation_stats(user_id: int = None) -> Dict:
    conn = get_db()
    try:
        if user_id:
            total = conn.execute(
                "SELECT COUNT(*) FROM ai_conversations WHERE user_id = %s",
                (user_id,)
            ).fetchone()[0]
            total_msgs = conn.execute(
                """SELECT COUNT(*) FROM ai_messages m
                   JOIN ai_conversations c ON m.conversation_id = c.id
                   WHERE c.user_id = %s""",
                (user_id,)
            ).fetchone()[0]
        else:
            total = conn.execute("SELECT COUNT(*) FROM ai_conversations").fetchone()[0]
            total_msgs = conn.execute("SELECT COUNT(*) FROM ai_messages").fetchone()[0]
        return {"total_conversations": total, "total_messages": total_msgs}
    finally:
        put_db(conn)
