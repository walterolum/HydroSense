"""
HydroSense AI — Background Workers & Memory Consolidation
Handles periodic memory consolidation, RAG re-indexing,
session cleanup, and profile aggregation.
"""

import asyncio
import time
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone

logger = logging.getLogger("hydrosense.worker")

class MemoryConsolidator:
    """Background worker that consolidates user memories and knowledge."""

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._consolidation_count = 0
        self._last_run = 0.0
        self._interval_seconds = 1800

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Memory consolidator started")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Memory consolidator stopped")

    async def _run_loop(self):
        while self._running:
            try:
                await self._consolidate_all()
                self._consolidation_count += 1
                self._last_run = time.time()
            except Exception as e:
                logger.error(f"Consolidation cycle failed: {e}")
            await asyncio.sleep(self._interval_seconds)

    async def _consolidate_all(self):
        """Run memory consolidation across all subsystems."""
        try:
            await self._consolidate_profiles()
        except Exception as e:
            logger.error(f"Profile consolidation failed: {e}")

        try:
            await self._consolidate_memories()
        except Exception as e:
            logger.error(f"Memory consolidation failed: {e}")

        try:
            await self._cleanup_sessions()
        except Exception as e:
            logger.error(f"Session cleanup failed: {e}")

    async def _consolidate_profiles(self):
        from pg_db import get_db, put_db
        conn = get_db()
        try:
            rows = conn.execute("""
                SELECT DISTINCT user_id FROM ai_user_memory
                WHERE updated_at > NOW() - INTERVAL '1 hour'
                AND is_active = 1
            """).fetchall()
            from user_profile import profile_engine
            from user_memory import user_memory
            for row in rows:
                uid = row["user_id"]
                try:
                    profile_engine.invalidate_cache(uid)
                    profile_engine.get_profile(uid)
                except Exception:
                    pass
            if rows:
                logger.info(f"Consolidated profiles for {len(rows)} users")
        except Exception as e:
            logger.warning(f"Profile consolidation query failed: {e}")
        finally:
            put_db(conn)

    async def _consolidate_memories(self):
        from pg_db import get_db, put_db
        conn = get_db()
        try:
            conn.execute("""
                UPDATE ai_user_memory
                SET access_count = access_count
                WHERE last_accessed_at < NOW() - INTERVAL '7 days'
                AND access_count < 2
                AND is_active = 1
            """)
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.warning(f"Memory consolidation failed: {e}")
        finally:
            put_db(conn)

    async def _cleanup_sessions(self):
        from session_manager import session_manager
        try:
            count = session_manager.cleanup_expired()
            if count > 0:
                logger.info(f"Cleaned {count} expired sessions")
        except Exception as e:
            logger.warning(f"Session cleanup failed: {e}")

    async def hydrate_rag_knowledge(self):
        """Seed RAG knowledge base if empty."""
        from rag_knowledge import rag_kb
        try:
            stats = await rag_kb.get_collection_stats()
            if stats.get("available") and stats.get("document_count", 0) == 0:
                await rag_kb.index_hydrosense_knowledge()
                logger.info("RAG knowledge base hydrated")
        except Exception as e:
            logger.error(f"RAG hydration failed: {e}")

    async def get_status(self) -> Dict[str, Any]:
        return {
            "running": self._running,
            "consolidation_count": self._consolidation_count,
            "last_run": self._last_run,
            "interval_seconds": self._interval_seconds,
        }


consolidator = MemoryConsolidator()
