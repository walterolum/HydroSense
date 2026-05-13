"""
HYDROSENSE v4.0 Offline Message Queue & Rural Optimization
Provides offline message queuing, lightweight communication protocols,
and sync capabilities for low-bandwidth rural environments.
"""

import os
import json
import sqlite3
import logging
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any, Callable
from dataclasses import dataclass

logger = logging.getLogger("hydrosense.offline_queue")

DB_PATH = os.getenv("DB_PATH", "../server/watermonitor.db")

# In-memory queue for when DB is not available
_memory_queue: List[Dict[str, Any]] = []
_queue_processor_running = False


@dataclass
class QueuedMessage:
    id: int = 0
    message_type: str = ""
    payload: str = ""
    channel: str = "app"
    recipient_id: Optional[int] = None
    recipient_contact: str = ""
    language: str = "en"
    priority: int = 0
    status: str = "pending"
    retry_count: int = 0
    max_retries: int = 3
    created_at: str = ""
    synced_at: Optional[str] = None


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_queue_table():
    conn = _get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS offline_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                channel TEXT DEFAULT 'app',
                recipient_id INTEGER,
                recipient_contact TEXT,
                language TEXT DEFAULT 'en',
                priority INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                retry_count INTEGER DEFAULT 0,
                max_retries INTEGER DEFAULT 3,
                error_message TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                synced_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_offline_queue_status ON offline_queue(status);
            CREATE INDEX IF NOT EXISTS idx_offline_queue_priority ON offline_queue(priority);
        """)
        conn.commit()
    except Exception as e:
        logger.warning(f"Queue table init: {e}")
    finally:
        conn.close()


def enqueue_message(
    message_type: str,
    payload: Dict[str, Any],
    channel: str = "app",
    recipient_id: Optional[int] = None,
    recipient_contact: str = "",
    language: str = "en",
    priority: int = 0,
    max_retries: int = 3,
) -> Dict[str, Any]:
    """Add a message to the offline queue."""
    conn = _get_db()
    try:
        payload_str = json.dumps(payload, default=str)
        result = conn.execute("""
            INSERT INTO offline_queue
                (message_type, payload, channel, recipient_id, recipient_contact,
                 language, priority, max_retries)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            message_type, payload_str, channel, recipient_id,
            recipient_contact or None, language, priority, max_retries,
        )).lastrowid
        conn.commit()

        _memory_queue.append({
            "id": result,
            "message_type": message_type,
            "payload": payload,
            "channel": channel,
            "recipient_id": recipient_id,
            "recipient_contact": recipient_contact,
            "language": language,
            "priority": priority,
            "status": "pending",
        })

        logger.info(f"Queued message #{result} ({message_type}) for {channel}")
        return {"success": True, "queue_id": result}
    except Exception as e:
        _memory_queue.append({
            "id": 0,
            "message_type": message_type,
            "payload": payload,
            "channel": channel,
            "recipient_id": recipient_id,
            "recipient_contact": recipient_contact,
            "language": language,
            "priority": priority,
            "status": "pending",
        })
        logger.warning(f"Queue to DB failed, using memory: {e}")
        return {"success": True, "queue_id": 0, "mode": "memory"}
    finally:
        conn.close()


def dequeue_pending(limit: int = 20) -> List[QueuedMessage]:
    """Get pending messages for processing."""
    conn = _get_db()
    try:
        rows = conn.execute("""
            SELECT * FROM offline_queue
            WHERE status = 'pending' AND retry_count < max_retries
            ORDER BY priority DESC, created_at ASC
            LIMIT ?
        """, (limit,)).fetchall()
        return [QueuedMessage(**dict(r)) for r in rows]
    finally:
        conn.close()


def mark_completed(queue_id: int):
    """Mark a queued message as completed."""
    conn = _get_db()
    try:
        conn.execute(
            "UPDATE offline_queue SET status = 'completed', synced_at = datetime('now') WHERE id = ?",
            (queue_id,),
        )
        conn.commit()
    finally:
        conn.close()


def mark_failed(queue_id: int, error: str = ""):
    """Mark a queued message as failed."""
    conn = _get_db()
    try:
        conn.execute("""
            UPDATE offline_queue
            SET status = 'failed', retry_count = retry_count + 1,
                error_message = ?, synced_at = datetime('now')
            WHERE id = ?
        """, (error[:500], queue_id))
        conn.commit()
    finally:
        conn.close()


def mark_retrying(queue_id: int):
    """Increment retry count for a message."""
    conn = _get_db()
    try:
        conn.execute("""
            UPDATE offline_queue
            SET retry_count = retry_count + 1, status = 'pending'
            WHERE id = ?
        """, (queue_id,))
        conn.commit()
    finally:
        conn.close()


def get_queue_stats() -> Dict[str, Any]:
    """Get queue statistics for monitoring."""
    conn = _get_db()
    try:
        total = conn.execute("SELECT COUNT(*) as c FROM offline_queue").fetchone()["c"]
        by_status = conn.execute(
            "SELECT status, COUNT(*) as c FROM offline_queue GROUP BY status"
        ).fetchall()
        by_channel = conn.execute(
            "SELECT channel, COUNT(*) as c FROM offline_queue GROUP BY channel"
        ).fetchall()
        pending_high = conn.execute(
            "SELECT COUNT(*) as c FROM offline_queue WHERE status='pending' AND priority >= 5"
        ).fetchone()["c"]
        failed = conn.execute(
            "SELECT COUNT(*) as c FROM offline_queue WHERE status='failed'"
        ).fetchone()["c"]

        return {
            "total": total,
            "by_status": {r["status"]: r["c"] for r in by_status},
            "by_channel": {r["channel"]: r["c"] for r in by_channel},
            "pending_high_priority": pending_high,
            "failed": failed,
        }
    finally:
        conn.close()


async def process_queue(processor: Callable[[QueuedMessage], None], batch_size: int = 10):
    """Process pending messages using the provided processor function."""
    messages = dequeue_pending(batch_size)
    processed = 0

    for msg in messages:
        try:
            processor(msg)
            mark_completed(msg.id)
            processed += 1
        except Exception as e:
            logger.error(f"Queue processing error for #{msg.id}: {e}")
            if msg.retry_count >= msg.max_retries:
                mark_failed(msg.id, str(e))
            else:
                mark_retrying(msg.id)

    if _memory_queue:
        for msg in _memory_queue[:]:
            if msg["status"] == "pending":
                msg["status"] = "completed"
                _memory_queue.remove(msg)
                processed += 1

    return processed


def get_offline_mode_config() -> Dict[str, Any]:
    """Get configuration for offline/low-bandwidth mode."""
    return {
        "queue_enabled": True,
        "sync_interval_seconds": 300,
        "max_queue_size": 1000,
        "compression_enabled": True,
        "batch_sync_size": 20,
        "retry_policy": {
            "max_retries": 3,
            "base_delay_seconds": 30,
            "backoff_multiplier": 2,
        },
        "lightweight_protocols": ["json_minimal", "msgpack"],
        "supported_offline_actions": [
            "submit_report",
            "send_voice_message",
            "upload_photo",
            "chat_message",
            "status_check",
        ],
    }


init_queue_table()
