"""
HydroSense AI — Multi-Provider AI Router
Routes requests across Gemini, OpenAI, Claude, and Ollama with
smart fallback, health tracking, and model selection.
"""

import os
import json
import time
import asyncio
import logging
from typing import Optional, List, Dict, Any, AsyncGenerator, Callable
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger("hydrosense.ai_router")


class Provider(Enum):
    GEMINI = "gemini"
    OPENAI = "openai"
    CLAUDE = "claude"
    OLLAMA = "ollama"
    RULE_BASED = "rule_based"


@dataclass
class ProviderStatus:
    provider: Provider
    healthy: bool = False
    last_check: float = 0.0
    latency_ms: float = 0.0
    error_count: int = 0
    consecutive_failures: int = 0
    rate_limited_until: float = 0.0


class AIRouter:
    """Routes AI requests to the best available provider with fallback."""

    def __init__(self):
        self._providers: Dict[Provider, ProviderStatus] = {
            Provider.GEMINI: ProviderStatus(provider=Provider.GEMINI),
            Provider.OPENAI: ProviderStatus(provider=Provider.OPENAI),
            Provider.CLAUDE: ProviderStatus(provider=Provider.CLAUDE),
            Provider.OLLAMA: ProviderStatus(provider=Provider.OLLAMA),
        }
        self._provider_order: List[Provider] = []
        self._refresh_provider_order()
        self._metrics = {"total_requests": 0, "by_provider": {}, "fallbacks": 0}

    def _refresh_provider_order(self):
        order = []
        for p, cfg in [
            (Provider.GEMINI, "GEMINI_API_KEY"),
            (Provider.OPENAI, "OPENAI_API_KEY"),
            (Provider.CLAUDE, "ANTHROPIC_API_KEY"),
            (Provider.OLLAMA, "OLLAMA_BASE_URL"),
        ]:
            if os.getenv(cfg):
                order.append(p)
        order.append(Provider.RULE_BASED)
        self._provider_order = order

    def get_available_providers(self) -> List[Provider]:
        return [p for p in self._provider_order if p != Provider.RULE_BASED]

    def is_provider_available(self, provider: Provider) -> bool:
        if provider == Provider.RULE_BASED:
            return True
        status = self._providers.get(provider)
        if not status:
            return False
        if time.time() < status.rate_limited_until:
            return False
        if status.consecutive_failures >= 3:
            return False
        return True

    async def _check_gemini(self) -> bool:
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            return False
        try:
            import httpx
            start = time.time()
            async with httpx.AsyncClient(timeout=5.0) as client:
                model = os.getenv("GEMINI_MODEL", "gemini-2.5-pro-preview-05-20")
                resp = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}",
                    params={"key": api_key},
                )
                ok = resp.status_code == 200
                self._providers[Provider.GEMINI].latency_ms = (time.time() - start) * 1000
                self._providers[Provider.GEMINI].healthy = ok
                return ok
        except Exception as e:
            logger.warning(f"Gemini health check failed: {e}")
            self._providers[Provider.GEMINI].healthy = False
            return False

    async def _check_openai(self) -> bool:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            return False
        try:
            import httpx
            start = time.time()
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                ok = resp.status_code == 200
                self._providers[Provider.OPENAI].latency_ms = (time.time() - start) * 1000
                self._providers[Provider.OPENAI].healthy = ok
                return ok
        except Exception as e:
            logger.warning(f"OpenAI health check failed: {e}")
            self._providers[Provider.OPENAI].healthy = False
            return False

    async def _check_claude(self) -> bool:
        api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            return False
        try:
            import httpx
            start = time.time()
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                )
                ok = resp.status_code == 200
                self._providers[Provider.CLAUDE].latency_ms = (time.time() - start) * 1000
                self._providers[Provider.CLAUDE].healthy = ok
                return ok
        except Exception as e:
            logger.warning(f"Claude health check failed: {e}")
            self._providers[Provider.CLAUDE].healthy = False
            return False

    async def _check_ollama(self) -> bool:
        base_url = os.getenv("OLLAMA_BASE_URL", "").strip()
        if not base_url:
            return False
        try:
            import httpx
            start = time.time()
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{base_url}/api/tags")
                ok = resp.status_code == 200
                self._providers[Provider.OLLAMA].latency_ms = (time.time() - start) * 1000
                self._providers[Provider.OLLAMA].healthy = ok
                return ok
        except Exception as e:
            logger.warning(f"Ollama health check failed: {e}")
            self._providers[Provider.OLLAMA].healthy = False
            return False

    async def check_all_providers(self) -> Dict[Provider, bool]:
        checks = {
            Provider.GEMINI: self._check_gemini(),
            Provider.OPENAI: self._check_openai(),
            Provider.CLAUDE: self._check_claude(),
            Provider.OLLAMA: self._check_ollama(),
        }
        results = {}
        for provider, coro in checks.items():
            try:
                results[provider] = await coro
                if results[provider]:
                    self._providers[provider].consecutive_failures = 0
                    self._providers[provider].last_check = time.time()
                else:
                    self._providers[provider].consecutive_failures += 1
            except Exception as e:
                logger.error(f"Health check {provider.value}: {e}")
                results[provider] = False
                self._providers[provider].consecutive_failures += 1
        logger.info(f"Provider health: {', '.join(f'{p.value}={ok}' for p, ok in results.items())}")
        return results

    def select_best_provider(self, task_type: str = "chat") -> Provider:
        for p in self._provider_order:
            if p == Provider.RULE_BASED:
                return p
            if self.is_provider_available(p):
                return p
        return Provider.RULE_BASED

    def record_success(self, provider: Provider):
        self._providers[provider].consecutive_failures = 0
        self._providers[provider].error_count = 0
        self._metrics["total_requests"] += 1
        self._metrics["by_provider"][provider.value] = self._metrics["by_provider"].get(provider.value, 0) + 1

    def record_failure(self, provider: Provider):
        self._providers[provider].consecutive_failures += 1
        self._providers[provider].error_count += 1
        self._metrics["fallbacks"] += 1

    def record_rate_limit(self, provider: Provider, retry_after: float = 30.0):
        self._providers[provider].rate_limited_until = time.time() + retry_after
        self._providers[provider].consecutive_failures += 1

    def get_status(self) -> Dict:
        return {
            provider.value: {
                "healthy": s.healthy,
                "latency_ms": round(s.latency_ms, 1),
                "consecutive_failures": s.consecutive_failures,
                "rate_limited": time.time() < s.rate_limited_until,
            }
            for provider, s in self._providers.items()
        }

    def get_metrics(self) -> Dict:
        return {
            **self._metrics,
            "provider_order": [p.value for p in self._provider_order],
        }


ai_router = AIRouter()
