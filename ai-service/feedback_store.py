import json
import logging
import os
from typing import Dict, Optional, Any, List
from datetime import datetime

logger = logging.getLogger("hydrosense.feedback")

FEEDBACK_DIR = "./ai_analytics"


class FeedbackStore:
    """Stores user feedback on AI responses (thumbs up/down)."""

    def __init__(self):
        os.makedirs(FEEDBACK_DIR, exist_ok=True)
        self._path = os.path.join(FEEDBACK_DIR, "feedback.jsonl")
        self._feedback: List[Dict[str, Any]] = []
        self._load()

    def _load(self):
        try:
            if os.path.exists(self._path):
                with open(self._path, "r") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            try:
                                self._feedback.append(json.loads(line))
                            except json.JSONDecodeError:
                                continue
        except Exception as e:
            logger.warning(f"Failed to load feedback: {e}")

    def add(self, feedback: Dict[str, Any]) -> None:
        feedback["timestamp"] = datetime.utcnow().isoformat()
        self._feedback.append(feedback)
        try:
            with open(self._path, "a") as f:
                f.write(json.dumps(feedback) + "\n")
        except Exception as e:
            logger.warning(f"Failed to save feedback: {e}")

    def get_recent(self, limit: int = 50) -> List[Dict[str, Any]]:
        return self._feedback[-limit:]

    def get_stats(self) -> Dict[str, int]:
        positive = sum(1 for f in self._feedback if f.get("positive", False))
        negative = sum(1 for f in self._feedback if not f.get("positive", True))
        return {"total": len(self._feedback), "positive": positive, "negative": negative}


feedback_store = FeedbackStore()
