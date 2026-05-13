import time
import logging
import json
import os
from typing import Dict, List, Optional, Any
from datetime import datetime
from collections import deque
import asyncio

logger = logging.getLogger("hydra.diagnostics")

class MetricsCollector:
    def __init__(self, max_entries: int = 1000):
        self.max_entries = max_entries
        self._requests: deque = deque(maxlen=max_entries)
        self._errors: deque = deque(maxlen=500)
        self._latencies: deque = deque(maxlen=1000)
        self._health_checks: deque = deque(maxlen=100)
        self._start_time = time.time()
        self._request_count = 0
        self._error_count = 0
        self._success_count = 0

    @property
    def uptime_seconds(self) -> float:
        return time.time() - self._start_time

    def record_request(self, request_id: str, endpoint: str, duration_ms: float, status: str, metadata: Optional[Dict] = None):
        self._request_count += 1
        if status == "success":
            self._success_count += 1
        else:
            self._error_count += 1
        self._requests.append({
            "id": request_id,
            "endpoint": endpoint,
            "duration_ms": round(duration_ms, 1),
            "status": status,
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": metadata or {},
        })
        self._latencies.append(duration_ms)

    def record_error(self, error_type: str, message: str, endpoint: str = "", request_id: str = ""):
        self._errors.append({
            "type": error_type,
            "message": message[:200],
            "endpoint": endpoint,
            "request_id": request_id,
            "timestamp": datetime.utcnow().isoformat(),
        })

    def record_health_check(self, status: str, latency_ms: float, details: Optional[Dict] = None):
        self._health_checks.append({
            "status": status,
            "latency_ms": round(latency_ms, 1),
            "details": details or {},
            "timestamp": datetime.utcnow().isoformat(),
        })

    def get_latency_stats(self) -> Dict:
        vals = list(self._latencies)
        if not vals:
            return {"avg_ms": 0, "min_ms": 0, "max_ms": 0, "p50_ms": 0, "p95_ms": 0, "p99_ms": 0, "count": 0}
        sorted_vals = sorted(vals)
        n = len(sorted_vals)
        return {
            "avg_ms": round(sum(vals) / n, 1),
            "min_ms": round(sorted_vals[0], 1),
            "max_ms": round(sorted_vals[-1], 1),
            "p50_ms": round(sorted_vals[n // 2], 1),
            "p95_ms": round(sorted_vals[int(n * 0.95)], 1),
            "p99_ms": round(sorted_vals[int(n * 0.99)], 1),
            "count": n,
        }

    def get_error_summary(self) -> Dict:
        errors = list(self._errors)
        if not errors:
            return {"total": 0, "by_type": {}}
        by_type = {}
        for e in errors:
            t = e["type"]
            by_type[t] = by_type.get(t, 0) + 1
        return {
            "total": len(errors),
            "by_type": by_type,
            "recent": errors[-20:],
        }

    def get_health_summary(self) -> Dict:
        checks = list(self._health_checks)
        if not checks:
            return {"total": 0, "success_rate": 0, "last_check": None}
        successes = sum(1 for c in checks if c["status"] == "ok")
        return {
            "total": len(checks),
            "success_rate": round(successes / len(checks) * 100, 1) if checks else 0,
            "last_check": checks[-1] if checks else None,
        }

    def get_full_report(self) -> Dict:
        return {
            "uptime_seconds": self.uptime_seconds,
            "uptime_formatted": self._format_uptime(),
            "requests": {
                "total": self._request_count,
                "success": self._success_count,
                "error": self._error_count,
                "success_rate": round(
                    self._success_count / max(self._request_count, 1) * 100, 1
                ),
            },
            "latency": self.get_latency_stats(),
            "errors": self.get_error_summary(),
            "health": self.get_health_summary(),
        }

    def _format_uptime(self) -> str:
        s = self.uptime_seconds
        days, rem = divmod(s, 86400)
        hours, rem = divmod(rem, 3600)
        mins, secs = divmod(rem, 60)
        parts = []
        if days > 0: parts.append(f"{int(days)}d")
        if hours > 0: parts.append(f"{int(hours)}h")
        if mins > 0: parts.append(f"{int(mins)}m")
        parts.append(f"{int(secs)}s")
        return " ".join(parts)

class DiagnosticsReporter:
    def __init__(self, collector: MetricsCollector, log_path: str = "ai_diagnostics.log"):
        self.collector = collector
        self.log_path = log_path

    def generate_report(self) -> str:
        report = self.collector.get_full_report()
        lines = [
            "=" * 60,
            "  HYDROSENSE AI DIAGNOSTICS REPORT",
            f"  Generated: {datetime.utcnow().isoformat()}",
            "=" * 60,
            "",
            f"Uptime: {report['uptime_formatted']}",
            "",
            "  Requests:",
            f"    Total:   {report['requests']['total']}",
            f"    Success: {report['requests']['success']}",
            f"    Error:   {report['requests']['error']}",
            f"    Rate:    {report['requests']['success_rate']}%",
            "",
            "  Latency (ms):",
            f"    Avg: {report['latency']['avg_ms']}",
            f"    P50: {report['latency']['p50_ms']}",
            f"    P95: {report['latency']['p95_ms']}",
            f"    P99: {report['latency']['p99_ms']}",
            "",
            f"  Health Checks: {report['health']['total']}",
            f"  Health Rate:   {report['health']['success_rate']}%",
            "",
            "  Errors by Type:",
        ]
        for etype, count in report["errors"]["by_type"].items():
            lines.append(f"    {etype}: {count}")
        lines.extend(["", "=" * 60])
        return "\n".join(lines)

    def save_report(self):
        try:
            report = self.generate_report()
            with open(self.log_path, "w", encoding="utf-8") as f:
                f.write(report)
            logger.info(f"Diagnostics report saved to {self.log_path}")
        except Exception as e:
            logger.error(f"Failed to save report: {e}")

class HealthMonitor:
    def __init__(self, check_interval: float = 15.0, collector: Optional[MetricsCollector] = None):
        self.check_interval = check_interval
        self.collector = collector or MetricsCollector()
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._status = "unknown"
        self._last_check_time = 0.0

    @property
    def status(self) -> str:
        return self._status

    async def check(self) -> Dict:
        import sqlite3
        start = time.time()
        db_ok = False
        db_path = os.getenv("DB_PATH", "../server/watermonitor.db")
        try:
            conn = sqlite3.connect(db_path)
            conn.execute("SELECT 1").fetchone()
            conn.close()
            db_ok = True
        except Exception:
            pass
        latency = (time.time() - start) * 1000
        status = "ok" if db_ok else "degraded"
        self._status = status
        self._last_check_time = time.time()
        self.collector.record_health_check(status, latency, {"db": db_ok})
        return {"status": status, "latency_ms": round(latency, 1), "db_connected": db_ok}

    async def start_monitoring(self):
        self._running = True
        while self._running:
            await self.check()
            await asyncio.sleep(self.check_interval)

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

_metrics_collector: Optional[MetricsCollector] = None

def get_metrics_collector() -> MetricsCollector:
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = MetricsCollector()
    return _metrics_collector
