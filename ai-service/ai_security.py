import re
import logging
from typing import Tuple

logger = logging.getLogger("hydrosense.security")

INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|directions|commands|prompts)",
    r"forget\s+(everything|all|your instructions|your prompt)",
    r"you\s+are\s+(now|no longer)\s+\w+",
    r"(new|override|updated)\s+(instructions|system prompt|directives|rules)",
    r"(do not|don't)\s+(follow|obey|listen to|adhere to)",
    r"jailbreak|jail\s*break",
    r"(your\s+)?system\s+prompt",
    r"reveal\s+(your|the)\s+(prompt|instructions|system)",
    r"output\s+(your|the|this)\s+(prompt|instructions|system)",
    r"print\s+(your|the)\s+(prompt|instructions)",
    r"show\s+(me\s+)?(your|the)\s+(prompt|instructions|system)",
    r"you\s+must\s+(now\s+)?(obey|follow|do)",
    r"admin(istrator)?\s+(override|command|mode)",
    r"simulate\s+(a\s+)?(jailbreak|root|admin)",
    r"DAN|do\s+anything\s+now",
    r"hypothetical\s+(scenario|situation).*ignore",
    r"role\s*(play|playing)\s*(as|prompt)",
]

SENSITIVE_PATTERNS = [
    r"(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|EXEC)\s.*\bFROM\b",
    r"(?:your\s+)?(?:API|secret|private|access)\s*(?:key|token|password)",
    r"(?:admin|root)\s*(?:password|credential)",
    r"(?:ssh|ssl|tls)\s*(?:key|cert)",
]

_MAX_INPUT_LENGTH = 10000


def detect_injection(text: str) -> Tuple[bool, str]:
    text_clean = text.strip().lower()
    if len(text_clean) > _MAX_INPUT_LENGTH:
        return True, "Input exceeds maximum length"

    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, text_clean):
            logger.warning(f"Prompt injection detected — pattern matched: {pattern[:50]}")
            return True, "Potential prompt manipulation detected"

    for pattern in SENSITIVE_PATTERNS:
        if re.search(pattern, text_clean):
            logger.warning(f"Sensitive content detected — pattern matched: {pattern[:50]}")
            return True, "Request contains sensitive database or security content"

    return False, ""


def sanitize_input(text: str) -> str:
    text = text.strip()
    text = text[:10000]
    text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def sanitize_output(text: str) -> str:
    text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', text)
    return text[:32000]


class AIRateLimitGuard:
    """Enhanced rate limiting with user-based tracking."""

    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._buckets: dict = {}

    def is_allowed(self, user_id: str = "anonymous") -> Tuple[bool, int]:
        import time
        now = time.time()
        window_start = now - self.window_seconds
        if user_id not in self._buckets:
            self._buckets[user_id] = []
        self._buckets[user_id] = [t for t in self._buckets[user_id] if t > window_start]
        if len(self._buckets[user_id]) >= self.max_requests:
            retry_after = int(self._buckets[user_id][0] + self.window_seconds - now)
            return False, max(1, retry_after)
        self._buckets[user_id].append(now)
        return True, 0

    def cleanup(self):
        import time
        now = time.time()
        cutoff = now - self.window_seconds
        stale = [uid for uid, reqs in self._buckets.items() if all(t < cutoff for t in reqs)]
        for uid in stale:
            del self._buckets[uid]


security_guard = AIRateLimitGuard()
