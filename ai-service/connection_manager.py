import asyncio
import time
import uuid
import logging
import json
from typing import Optional, Dict, Any, Set, Callable
from enum import Enum

logger = logging.getLogger("hydra.connection")

class ConnectionState(Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DEGRADED = "degraded"
    RECONNECTING = "reconnecting"

class AIRequest:
    def __init__(self, request_id: str, message: str, metadata: Optional[Dict] = None):
        self.id = request_id
        self.message = message
        self.metadata = metadata or {}
        self.created_at = time.time()
        self.status = "pending"
        self.progress = 0.0
        self.result = None
        self.error = None
        self._completion_event = asyncio.Event()

    async def wait_for_completion(self, timeout: float = 60.0) -> Any:
        try:
            await asyncio.wait_for(self._completion_event.wait(), timeout=timeout)
            if self.error:
                raise self.error
            return self.result
        except asyncio.TimeoutError:
            self.status = "timeout"
            raise TimeoutError(f"Request {self.id} timed out after {timeout}s")

    def set_result(self, result: Any):
        self.result = result
        self.status = "completed"
        self.progress = 1.0
        self._completion_event.set()

    def set_error(self, error: Exception):
        self.error = error
        self.status = "failed"
        self._completion_event.set()

class ConnectionManager:
    def __init__(self, max_concurrent: int = 8, request_timeout: float = 60.0, max_queue: int = 100):
        self.max_concurrent = max_concurrent
        self.request_timeout = request_timeout
        self.max_queue = max_queue
        self._state = ConnectionState.DISCONNECTED
        self._requests: Dict[str, AIRequest] = {}
        self._pending_queue: asyncio.Queue = asyncio.Queue(maxsize=max_queue)
        self._active_count = 0
        self._lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None
        self._health_listeners: Set[Callable] = set()
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 10
        self._base_reconnect_delay = 1.0
        self._max_reconnect_delay = 60.0
        self._session_id = str(uuid.uuid4())[:8]
        self._start_time = time.time()
        self._metrics = {
            "total_requests": 0,
            "completed": 0,
            "failed": 0,
            "timed_out": 0,
            "reconnections": 0,
        }

    @property
    def state(self) -> ConnectionState:
        return self._state

    @property
    def session_id(self) -> str:
        return self._session_id

    @property
    def uptime_seconds(self) -> float:
        return time.time() - self._start_time

    @property
    def active_requests(self) -> int:
        return len([r for r in self._requests.values() if r.status in ("pending", "processing")])

    @property
    def metrics(self) -> Dict:
        return {**self._metrics, "active": self.active_requests, "queued": self._pending_queue.qsize()}

    def on_health_change(self, callback: Callable):
        self._health_listeners.add(callback)

    def _notify_health(self, state: ConnectionState):
        for cb in self._health_listeners:
            try:
                cb(state)
            except Exception:
                pass

    def set_state(self, new_state: ConnectionState):
        old = self._state
        self._state = new_state
        if new_state in (ConnectionState.CONNECTED, ConnectionState.DEGRADED) and old in (
            ConnectionState.DISCONNECTED, ConnectionState.RECONNECTING
        ):
            self._reconnect_attempts = 0
        self._notify_health(new_state)

    def create_request(self, message: str, metadata: Optional[Dict] = None) -> AIRequest:
        request_id = str(uuid.uuid4())[:12]
        req = AIRequest(request_id, message, metadata)
        self._requests[request_id] = req
        self._metrics["total_requests"] += 1
        return req

    async def enqueue_request(self, request: AIRequest) -> bool:
        try:
            await asyncio.wait_for(self._pending_queue.put(request), timeout=5.0)
            return True
        except asyncio.TimeoutError:
            return False

    async def process_queue(self, processor):
        while True:
            request = await self._pending_queue.get()
            async with self._lock:
                if self._active_count >= self.max_concurrent:
                    await asyncio.sleep(0.5)
                    await self._pending_queue.put(request)
                    continue
                self._active_count += 1
            try:
                async with self._lock:
                    request.status = "processing"
                await processor(request)
            except Exception as e:
                logger.error(f"Request {request.id} failed: {e}")
                request.set_error(e)
                self._metrics["failed"] += 1
            finally:
                async with self._lock:
                    self._active_count -= 1
                self._pending_queue.task_done()

    def get_request(self, request_id: str) -> Optional[AIRequest]:
        return self._requests.get(request_id)

    def cleanup_old_requests(self, max_age: float = 300.0):
        now = time.time()
        stale = [rid for rid, req in self._requests.items()
                 if req.status in ("completed", "failed", "timeout")
                 and now - req.created_at > max_age]
        for rid in stale:
            del self._requests[rid]
        if stale:
            logger.debug(f"Cleaned up {len(stale)} stale requests")

    async def start_cleanup_loop(self, interval: float = 60.0):
        while True:
            await asyncio.sleep(interval)
            self.cleanup_old_requests()

    def calculate_reconnect_delay(self) -> float:
        delay = min(
            self._base_reconnect_delay * (2 ** min(self._reconnect_attempts, 6)),
            self._max_reconnect_delay
        )
        jitter = delay * 0.1 * (hash(str(uuid.uuid4())) % 100) / 100.0
        return delay + jitter

    async def exponential_backoff(self):
        delay = self.calculate_reconnect_delay()
        self._reconnect_attempts += 1
        self._metrics["reconnections"] += 1
        logger.info(f"Reconnect attempt {self._reconnect_attempts}, waiting {delay:.1f}s")
        await asyncio.sleep(delay)

    def should_abort_reconnect(self) -> bool:
        return self._reconnect_attempts >= self._max_reconnect_attempts

    def get_diagnostics(self) -> Dict:
        return {
            "state": self._state.value,
            "session_id": self._session_id,
            "uptime_seconds": self.uptime_seconds,
            "metrics": self.metrics,
            "reconnect_attempts": self._reconnect_attempts,
            "active_requests": self.active_requests,
            "queued_requests": self._pending_queue.qsize(),
            "total_tracked": len(self._requests),
        }

_connection_manager: Optional[ConnectionManager] = None

def get_connection_manager() -> ConnectionManager:
    global _connection_manager
    if _connection_manager is None:
        _connection_manager = ConnectionManager()
    return _connection_manager

def reset_connection_manager():
    global _connection_manager
    _connection_manager = None
