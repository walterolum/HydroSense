"""
Enterprise-grade retry decorator with exponential backoff, jitter,
circuit breaker, and comprehensive error classification.

Usage:
    @retry(max_attempts=3, base_delay=1.0, max_delay=60.0)
    async def my_async_func():
        ...

    @retry(max_attempts=5, retryable_exceptions=(ConnectionError, TimeoutError))
    def my_sync_func():
        ...

    cb = CircuitBreaker(failure_threshold=5, recovery_timeout=30.0)
    result = await cb.call(my_async_func)
"""

import asyncio
import time
import random
import functools
import logging
from typing import Type, Tuple, Optional, Callable, Any, Union

logger = logging.getLogger("hydrosense.retry")

# ═══════════════════════════════════════════════════════════════
# RETRY DECORATOR
# ═══════════════════════════════════════════════════════════════

def retry(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    jitter: bool = True,
    jitter_factor: float = 0.1,
    retryable_exceptions: Optional[Tuple[Type[Exception], ...]] = None,
    on_retry: Optional[Callable] = None,
    on_failure: Optional[Callable] = None,
):
    """
    Retry decorator with exponential backoff and jitter.

    Args:
        max_attempts: Maximum number of attempts (including first)
        base_delay: Initial delay between retries (seconds)
        max_delay: Maximum delay between retries (seconds)
        jitter: Add random jitter to delay
        jitter_factor: Fraction of delay to use for jitter
        retryable_exceptions: Tuple of exception types that should trigger retry
        on_retry: Callback on each retry (args: attempt, exception, delay)
        on_failure: Callback when all retries exhausted (args: last_exception)
    """
    if retryable_exceptions is None:
        retryable_exceptions = (
            ConnectionError, ConnectionRefusedError, ConnectionResetError,
            TimeoutError, asyncio.TimeoutError, OSError,
        )

    def decorator(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except retryable_exceptions as e:
                    last_exception = e
                    if attempt < max_attempts:
                        delay = _calculate_delay(attempt, base_delay, max_delay, jitter, jitter_factor)
                        logger.warning(
                            f"Retry {attempt}/{max_attempts} for {func.__name__}: {e} "
                            f"(retrying in {delay:.1f}s)"
                        )
                        if on_retry:
                            on_retry(attempt, e, delay)
                        await asyncio.sleep(delay)
                    else:
                        logger.error(f"All {max_attempts} attempts failed for {func.__name__}: {e}")
                        if on_failure:
                            on_failure(e)
                        raise
                except Exception as e:
                    # Non-retryable exception — raise immediately
                    raise

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except retryable_exceptions as e:
                    last_exception = e
                    if attempt < max_attempts:
                        delay = _calculate_delay(attempt, base_delay, max_delay, jitter, jitter_factor)
                        logger.warning(
                            f"Retry {attempt}/{max_attempts} for {func.__name__}: {e} "
                            f"(retrying in {delay:.1f}s)"
                        )
                        if on_retry:
                            on_retry(attempt, e, delay)
                        time.sleep(delay)
                    else:
                        logger.error(f"All {max_attempts} attempts failed for {func.__name__}: {e}")
                        if on_failure:
                            on_failure(e)
                        raise
                except Exception as e:
                    raise

            return func(*args, **kwargs)

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


def _calculate_delay(
    attempt: int,
    base_delay: float,
    max_delay: float,
    jitter: bool,
    jitter_factor: float,
) -> float:
    delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
    if jitter:
        delay += delay * jitter_factor * (random.random() * 2 - 1)
        delay = max(0, delay)
    return delay


# ═══════════════════════════════════════════════════════════════
# CIRCUIT BREAKER
# ═══════════════════════════════════════════════════════════════

class CircuitBreakerState:
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing — requests rejected immediately
    HALF_OPEN = "half_open" # Testing if service recovered


class CircuitBreaker:
    """
    Circuit breaker to prevent cascading failures.

    - CLOSED: Normal operation, all calls pass through
    - OPEN: Failure threshold reached, calls fail fast
    - HALF_OPEN: After recovery timeout, allows a test call

    Usage:
        cb = CircuitBreaker(failure_threshold=5, recovery_timeout=30.0)
        async with cb:
            result = await risky_call()
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 1,
        name: str = "default",
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self.name = name

        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0
        self.half_open_calls = 0
        self._lock = asyncio.Lock()

    async def __aenter__(self):
        await self._check_state()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None and self._is_retryable(exc_type):
            await self._record_failure()
        else:
            await self._record_success()
        return False

    def _is_retryable(self, exc_type: Type[Exception]) -> bool:
        return issubclass(exc_type, (
            ConnectionError, ConnectionRefusedError, ConnectionResetError,
            TimeoutError, asyncio.TimeoutError, OSError,
        ))

    async def _check_state(self):
        async with self._lock:
            if self.state == CircuitBreakerState.CLOSED:
                return

            if self.state == CircuitBreakerState.OPEN:
                if time.time() - self.last_failure_time >= self.recovery_timeout:
                    self.state = CircuitBreakerState.HALF_OPEN
                    self.half_open_calls = 0
                    logger.info(f"[CB:{self.name}] Circuit half-open, testing...")
                else:
                    remaining = self.recovery_timeout - (time.time() - self.last_failure_time)
                    raise CircuitBreakerOpenError(
                        f"Circuit breaker '{self.name}' is OPEN. "
                        f"Retry in {remaining:.1f}s"
                    )

            if self.state == CircuitBreakerState.HALF_OPEN:
                self.half_open_calls += 1
                if self.half_open_calls > self.half_open_max_calls:
                    raise CircuitBreakerOpenError(
                        f"Circuit breaker '{self.name}' half-open, "
                        f"max test calls ({self.half_open_max_calls}) reached"
                    )

    async def _record_failure(self):
        async with self._lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            logger.warning(
                f"[CB:{self.name}] Failure {self.failure_count}/"
                f"{self.failure_threshold}"
            )
            if self.failure_count >= self.failure_threshold:
                self.state = CircuitBreakerState.OPEN
                logger.error(
                    f"[CB:{self.name}] Circuit OPEN — too many failures "
                    f"({self.failure_count})"
                )

    async def _record_success(self):
        async with self._lock:
            if self.state == CircuitBreakerState.HALF_OPEN:
                self.state = CircuitBreakerState.CLOSED
                self.failure_count = 0
                logger.info(f"[CB:{self.name}] Circuit CLOSED — recovery successful")
            elif self.state == CircuitBreakerState.CLOSED:
                self.failure_count = max(0, self.failure_count - 1)

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        async with self:
            return await func(*args, **kwargs)

    def get_state(self) -> dict:
        return {
            "name": self.name,
            "state": self.state,
            "failure_count": self.failure_count,
            "failure_threshold": self.failure_threshold,
            "last_failure_time": self.last_failure_time,
            "recovery_timeout": self.recovery_timeout,
        }


class CircuitBreakerOpenError(Exception):
    """Raised when a circuit breaker is open and rejects a call."""
    pass


# ═══════════════════════════════════════════════════════════════
# TIMEOUT WRAPPER
# ═══════════════════════════════════════════════════════════════

async def with_timeout(coro, timeout: float = 30.0, message: str = "Operation timed out"):
    """Run a coroutine with a timeout, providing a clear error message."""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        raise TimeoutError(f"{message} after {timeout}s")


# ═══════════════════════════════════════════════════════════════
# FALLBACK CHAIN
# ═══════════════════════════════════════════════════════════════

class FallbackChain:
    """
    Try multiple strategies in order. If one fails, try the next.

    Usage:
        chain = FallbackChain[str]()
        chain.add_strategy("gemini", call_gemini, timeout=15.0)
        chain.add_strategy("rule_based", rule_based_response)
        result = await chain.execute(message="hello")
    """

    def __init__(self):
        self.strategies = []

    def add_strategy(
        self,
        name: str,
        func: Callable,
        timeout: Optional[float] = None,
        retryable: bool = True,
    ):
        self.strategies.append({
            "name": name,
            "func": func,
            "timeout": timeout,
            "retryable": retryable,
        })

    async def execute(self, *args, **kwargs) -> dict:
        last_error = None
        for strategy in self.strategies:
            try:
                if strategy["timeout"]:
                    result = await asyncio.wait_for(
                        strategy["func"](*args, **kwargs),
                        timeout=strategy["timeout"],
                    )
                else:
                    result = await strategy["func"](*args, **kwargs)
                return {
                    "source": strategy["name"],
                    "result": result,
                }
            except Exception as e:
                last_error = e
                logger.warning(
                    f"Strategy '{strategy['name']}' failed: {e}"
                )
                continue

        raise FallbackChainExhaustedError(
            f"All strategies failed. Last error: {last_error}"
        )


class FallbackChainExhaustedError(Exception):
    """Raised when all fallback strategies have been exhausted."""
    pass
