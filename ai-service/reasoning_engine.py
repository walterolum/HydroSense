"""
HydroSense AI — Multi-Step Reasoning & Prompt Orchestration Engine
Implements chain-of-thought, deep reasoning, context orchestration,
adaptive prompt composition, and structured thinking.
"""

import re
import json
import time
import logging
import hashlib
from typing import List, Dict, Optional, Any, AsyncGenerator, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger("hydrosense.reasoning")

REASONING_STAGES = [
    "parse_intent",
    "gather_context",
    "analyze_evidence",
    "synthesize_response",
    "reflect_quality",
]

@dataclass
class ReasoningTrace:
    query: str
    stages: List[Dict] = field(default_factory=list)
    context_sources: List[str] = field(default_factory=list)
    confidence: float = 0.0
    start_time: float = 0.0
    end_time: float = 0.0
    iteration_count: int = 0

class PromptOrchestrator:
    """Builds adaptive, context-rich prompts using chain-of-thought."""

    def __init__(self):
        self._cache: Dict[str, str] = {}
        self._cache_ttl = 60.0

    def build_deep_prompt(
        self,
        message: str,
        role: str,
        district: Optional[str],
        system_context: str,
        memory_context: str,
        rag_context: str,
        session_context: str,
        profile_context: str,
        user_language: str = "en",
    ) -> Tuple[str, ReasoningTrace]:
        trace = ReasoningTrace(query=message, start_time=time.time())

        language_guide = ""
        if user_language and user_language != "en":
            language_guide = f"## Language Instruction\nRespond in {user_language}. Translate all technical terms naturally."

        role_guide = {
            "national_admin": "Provide strategic, national-level overviews with KPIs, policy implications, cross-district comparisons, and budget insights. Use data-driven executive summaries.",
            "district_officer": "Provide district-specific operational data, actionable insights, resource allocation recommendations, and local context. Focus on actionable intelligence.",
            "technician": "Provide technical repair guidance, sensor diagnostics, step-by-step procedures, schematic-level detail, and practical troubleshooting steps.",
            "citizen": "Provide warm, simple, plain-language explanations. Avoid jargon. Be reassuring and practical. Offer clear next steps.",
            "health_officer": "Provide health data correlations, epidemiological patterns, contamination pathways, and public health recommendations with statistical context.",
            "climate_scientist": "Provide detailed climate analytics, SPI interpretations, model confidence, data methodology, and scientific context with raw data references.",
            "community_committee": "Provide governance insights, community impact metrics, budget transparency, and actionable community-level recommendations.",
            "ngo_officer": "Provide programmatic insights, donor-relevant metrics, impact assessments, and alignment with SDG targets.",
        }.get(role, "Provide helpful, accurate, and context-aware assistance.")

        depth_markers = self._detect_depth(message)
        complexity = depth_markers["complexity"]
        needs_reasoning = depth_markers["needs_reasoning"]

        thinking_protocol = ""
        if needs_reasoning or complexity > 0.5:
            thinking_protocol = """
## Deep Thinking Protocol
Follow this reasoning process for every response:

1. **PARSE_INTENT**: What is the user truly asking? Identify implicit needs, assumptions, and the core question beneath the surface.
2. **GATHER_CONTEXT**: What system data, historical context, and domain knowledge is relevant? Assemble all evidence.
3. **ANALYZE_EVIDENCE**: Examine from multiple angles — scientific, operational, social, financial. Look for patterns, correlations, and contradictions.
4. **SYNTHESIZE_RESPONSE**: Build a structured, coherent, well-supported response directly addressing the core question.
5. **REFLECT**: Is the response complete, accurate, and helpful? What follow-up might the user need?

Your internal reasoning should be thorough before responding. Show depth, not just breadth.
"""

        if needs_reasoning:
            trace.stages.append({"stage": "parse_intent", "complexity": complexity})

        prompt_parts = [
            "You are **Hydro AI** — an advanced general-purpose AI powering HYDROSENSE, Uganda's national water management platform.",
            "",
            "## Core Identity",
            "- You answer **any** question with depth, accuracy, and intellectual honesty.",
            "- You reason step-by-step before responding to complex queries.",
            "- You adapt your tone, complexity, and depth to the user's role and expertise.",
            "- You cite evidence and acknowledge uncertainty where appropriate.",
            "",
            f"## Role Adaptation\n{role_guide}",
            "",
        ]

        if language_guide:
            prompt_parts.append(language_guide)
            prompt_parts.append("")

        if thinking_protocol:
            prompt_parts.append(thinking_protocol)
            prompt_parts.append("")

        if memory_context:
            prompt_parts.append(f"## User Memory & Preferences\n{memory_context}\n")
            trace.context_sources.append("memory")

        if profile_context:
            prompt_parts.append(f"## Communication Profile\n{profile_context}\n")
            trace.context_sources.append("profile")

        if session_context:
            prompt_parts.append(f"## Session & Conversation Context\n{session_context}\n")
            trace.context_sources.append("session")

        if system_context:
            prompt_parts.append(f"## Live HYDROSENSE System Data\n{system_context}\n")
            trace.context_sources.append("system")

        if rag_context:
            prompt_parts.append(f"## Knowledge Base References\n{rag_context}\n")
            trace.context_sources.append("knowledge_base")

        prompt_parts.append("""
## Response Guidelines
- Use **bold** for key figures and important terms.
- Use bullet points for comparisons and lists.
- Use numbered steps for procedures.
- Use headings and sections for complex answers.
- **Be thorough**: Simple questions get concise answers. Complex topics get depth, examples, and nuance.
- End with an open question or suggestion to continue when appropriate.
- If you're unsure, say so honestly rather than fabricating information.
""")

        prompt_parts.append(f"\n## User Query\n{message}")

        full_prompt = "\n".join(prompt_parts)
        trace.end_time = time.time()

        return full_prompt, trace

    def _detect_depth(self, message: str) -> Dict[str, Any]:
        msg_lower = message.lower()
        words = message.split()
        word_count = len(words)

        reasoning_triggers = [
            r"\b(why|how|explain|analyze|compare|contrast|evaluate|assess|predict|forecast)\b",
            r"\b(what if|what would|tell me about|describe|detail|elaborate)\b",
            r"\b(relationship|correlation|pattern|trend|cause|impact|implication)\b",
            r"\b(multiple|complex|several|factors|variables|consider)\b",
        ]
        reasoning_score = sum(1 for p in reasoning_triggers if re.search(p, msg_lower))

        technical_terms = [
            r"\b(statistical|standard deviation|regression|correlation|probability)\b",
            r"\b(infrastructure|sustainability|functionality|coverage|threshold)\b",
            r"\b(contamination|turbidity|pathogen|parameter|calibration)\b",
        ]
        technical_score = sum(1 for p in technical_terms if re.search(p, msg_lower))

        complexity = min(1.0, (reasoning_score * 0.25 + technical_score * 0.15 + min(word_count / 50, 1.0) * 0.2))

        return {
            "needs_reasoning": reasoning_score >= 2 or word_count > 30,
            "complexity": complexity,
            "reasoning_score": reasoning_score,
            "technical_score": technical_score,
        }

    def build_conversation_summary_prompt(self, turns: List[Dict]) -> str:
        parts = ["Summarize this conversation concisely:\n"]
        for t in turns[-20:]:
            role = "User" if t.get("role") == "user" else "AI"
            content = t.get("content", "")[:200]
            parts.append(f"{role}: {content}")
        parts.append("\nProvide a concise summary covering key topics, decisions, and context.")
        return "\n".join(parts)

orchestrator = PromptOrchestrator()
