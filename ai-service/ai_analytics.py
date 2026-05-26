import json
import logging
import time
import os
from typing import Dict, Optional, Any, List
from datetime import datetime, timedelta

logger = logging.getLogger("hydrosense.analytics")

ANALYTICS_DIR = "./ai_analytics"


class AIAnalytics:
    """Tracks AI usage, performance metrics, and user feedback."""

    def __init__(self):
        self._metrics: Dict[str, Any] = {
            "total_requests": 0,
            "total_tokens": 0,
            "total_latency_ms": 0,
            "errors": 0,
            "feedback": {"positive": 0, "negative": 0},
            "models_used": {},
            "sources": {},
            "daily_stats": {},
            "requests_by_role": {},
        }
        self._session_start = time.time()
        os.makedirs(ANALYTICS_DIR, exist_ok=True)
        self._load()

    def _load(self):
        path = os.path.join(ANALYTICS_DIR, "metrics.json")
        try:
            if os.path.exists(path):
                with open(path, "r") as f:
                    saved = json.load(f)
                    self._metrics.update(saved)
        except Exception as e:
            logger.warning(f"Failed to load analytics: {e}")

    def _save(self):
        path = os.path.join(ANALYTICS_DIR, "metrics.json")
        try:
            with open(path, "w") as f:
                json.dump(self._metrics, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save analytics: {e}")

    def record_request(self, role: str, source: str, model: str,
                       latency_ms: float, tokens: int = 0, success: bool = True):
        self._metrics["total_requests"] += 1
        self._metrics["total_latency_ms"] += latency_ms
        self._metrics["total_tokens"] += tokens

        if not success:
            self._metrics["errors"] += 1

        # Track by source
        src_key = source or "unknown"
        self._metrics["sources"][src_key] = self._metrics["sources"].get(src_key, 0) + 1

        # Track by model
        model_key = model or "unknown"
        self._metrics["models_used"][model_key] = self._metrics["models_used"].get(model_key, 0) + 1

        # Track by role
        role_key = role or "anonymous"
        self._metrics["requests_by_role"][role_key] = self._metrics["requests_by_role"].get(role_key, 0) + 1

        # Daily stats
        today = datetime.utcnow().strftime("%Y-%m-%d")
        if today not in self._metrics["daily_stats"]:
            self._metrics["daily_stats"][today] = {
                "requests": 0, "tokens": 0, "errors": 0, "avg_latency_ms": 0,
            }
        ds = self._metrics["daily_stats"][today]
        ds["requests"] += 1
        ds["tokens"] += tokens
        ds["errors"] += 0 if success else 1
        total_lat = ds.get("total_latency", 0) + latency_ms
        ds["total_latency"] = total_lat
        ds["avg_latency_ms"] = round(total_lat / ds["requests"], 1)

        self._save()

    def record_feedback(self, positive: bool):
        key = "positive" if positive else "negative"
        self._metrics["feedback"][key] += 1
        self._save()

    def get_stats(self) -> Dict[str, Any]:
        uptime = time.time() - self._session_start
        m = self._metrics
        avg_latency = 0
        if m["total_requests"] > 0:
            avg_latency = round(m["total_latency_ms"] / m["total_requests"], 1)

        return {
            "uptime_seconds": int(uptime),
            "total_requests": m["total_requests"],
            "total_tokens": m["total_tokens"],
            "avg_latency_ms": avg_latency,
            "errors": m["errors"],
            "error_rate": round(m["errors"] / max(m["total_requests"], 1) * 100, 2),
            "feedback": m["feedback"],
            "feedback_rate": round(
                m["feedback"]["positive"] / max(m["feedback"]["positive"] + m["feedback"]["negative"], 1) * 100, 1
            ),
            "sources": m["sources"],
            "models_used": m["models_used"],
            "requests_by_role": m["requests_by_role"],
            "daily_stats": dict(list(m["daily_stats"].items())[-30:]),
        }

    def get_daily_stats(self, days: int = 7) -> List[Dict]:
        rows = []
        for i in range(days - 1, -1, -1):
            day = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
            ds = self._metrics["daily_stats"].get(day, {"requests": 0, "tokens": 0, "errors": 0, "avg_latency_ms": 0})
            rows.append({"date": day, **ds})
        return rows

    def reset(self):
        self._metrics = {
            "total_requests": 0, "total_tokens": 0, "total_latency_ms": 0,
            "errors": 0, "feedback": {"positive": 0, "negative": 0},
            "models_used": {}, "sources": {}, "daily_stats": {}, "requests_by_role": {},
        }
        self._save()


ai_analytics = AIAnalytics()
