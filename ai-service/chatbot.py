import os
import re
import sqlite3
import asyncio
import time
import uuid
import json
import logging
import httpx
from typing import List, Dict, Optional, AsyncGenerator, Tuple
from datetime import datetime
from contextlib import asynccontextmanager

logger = logging.getLogger("hydrosense.chatbot")

DB_PATH = os.getenv("DB_PATH", "../server/watermonitor.db")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:streamGenerateContent?alt=sse"

# ── Multilingual support ──
LANGUAGE_CODES = {
    "en": "English", "lug": "Luganda", "nyn": "Runyankole",
    "teo": "Ateso", "luo": "Luo", "lgg": "Lugbara",
    "xog": "Lusoga", "cgg": "Rukiga", "ach": "Acholi", "swa": "Swahili",
}
LANG_NAMES = {v.lower(): k for k, v in LANGUAGE_CODES.items()}

ML_SYSTEM_PROMPT = """You are Hydro AI, the assistant for HYDROSENSE — Uganda's national climate-resilient rural water management platform.

MULTILINGUAL CAPABILITY: You MUST detect the user's language and respond in the SAME language they use. Supported languages:
- English, Luganda (lug), Runyankole (nyn), Ateso (teo), Luo (luo), Lugbara (lgg), Lusoga (xog), Rukiga (cgg), Acholi (ach), Swahili (swa)

If the user speaks a local Ugandan language, ALWAYS respond in that same language.
Translate all system data, technical terms, and numbers into the user's language.
Keep the same helpful, informative tone regardless of language.

You help water sector stakeholders understand system data, interpret predictions, and make informed decisions.
You have access to live data from water points across 15 Ugandan districts, IoT sensors, maintenance records, water quality tests, health incident data, climate forecasting, governance records, and budget allocation data.

ROLE-AWARE BEHAVIOUR: Adapt your tone based on the user's role. national_admin = strategic high-level overviews with KPIs. district_officer = district-specific operational data. technician = technical repair guidance with sensor data. citizen = simple plain language, warm and reassuring. health_officer = health data correlations.

RESPONSE FORMATTING: Use **bold** for key figures. Use bullet points for lists. Use numbered steps for procedures. Keep responses concise but complete.

IMAGE ANALYSIS: For any images (pump photos, water quality visuals, maps, documents), provide detailed environmental assessment with risk level and recommended action.

Generate structured situation reports when asked: include Executive Summary, Key Metrics, Priority Issues, Recommendations, and SDG 6 Alignment."""

MAX_CONCURRENT_REQUESTS = 6
REQUEST_TIMEOUT_SECONDS = 60.0
GEMINI_CALL_TIMEOUT = 30.0
STREAM_CHUNK_TIMEOUT = 5.0

_shared_client: Optional[httpx.AsyncClient] = None

def get_http_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            timeout=httpx.Timeout(GEMINI_CALL_TIMEOUT, connect=10.0, read=STREAM_CHUNK_TIMEOUT),
            limits=httpx.Limits(max_keepalive_connections=4, max_connections=8, keepalive_expiry=30),
            headers={"User-Agent": "HydroSense-AI/4.0"},
        )
    return _shared_client

_semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
_active_requests: Dict[str, dict] = {}

@asynccontextmanager
async def request_context(request_id: str):
    _active_requests[request_id] = {"start": time.time(), "status": "active"}
    try:
        yield
    finally:
        _active_requests.pop(request_id, None)

def get_active_request_count() -> int:
    return len(_active_requests)

def cancel_stale_requests(timeout: float = 60.0):
    now = time.time()
    stale = [rid for rid, info in _active_requests.items()
             if now - info["start"] > timeout]
    for rid in stale:
        _active_requests.pop(rid, None)

SYSTEM_PROMPT = ML_SYSTEM_PROMPT

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def build_context(user_message: str, role: str, district: Optional[str]) -> str:
    conn = get_db()
    try:
        msg_lower = user_message.lower()
        parts = [f"Current date/time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"]
        parts.append(f"User role: {role}" + (f", District: {district}" if district else ""))

        row = conn.execute("""
            SELECT
              (SELECT COUNT(*) FROM water_points) AS total_wp,
              (SELECT COUNT(*) FROM water_points WHERE status='functional') AS func_wp,
              (SELECT COUNT(*) FROM alerts WHERE status='active') AS active_alerts,
              (SELECT COUNT(*) FROM maintenance_requests WHERE status='pending') AS pending_mr,
              (SELECT COUNT(*) FROM users) AS total_users
        """).fetchone()
        parts.append(
            f"System stats: {row['total_wp']} water points ({row['func_wp']} functional), "
            f"{row['active_alerts']} active alerts, {row['pending_mr']} pending maintenance, "
            f"{row['total_users']} registered users."
        )

        try:
            role_rows = conn.execute("SELECT role, COUNT(*) AS c FROM users GROUP BY role").fetchall()
            if role_rows:
                parts.append(f"User breakdown by role: {', '.join(f'{r['c']} {r['role']}' for r in role_rows)}.")
        except Exception:
            pass

        try:
            budget_row = conn.execute("SELECT COUNT(*) AS alloc_count, SUM(amount) AS total_budget FROM budget_allocations").fetchone()
            if budget_row and budget_row["total_budget"] is not None:
                parts.append(f"Budget allocations: {budget_row['alloc_count']} allocations totalling UGX {budget_row['total_budget']:,.0f}.")
        except Exception:
            pass

        try:
            pollution_count = conn.execute("SELECT COUNT(*) FROM pollution_reports WHERE reported_at > datetime('now', '-30 days')").fetchone()[0]
            parts.append(f"Pollution reports (last 30 days): {pollution_count}.")
        except Exception:
            pass

        if any(w in msg_lower for w in ["district", "water point", "borehole", "sensor", "alert", "maintenance"]):
            if district:
                wp = conn.execute("SELECT COUNT(*) AS c, SUM(beneficiaries) AS b FROM water_points WHERE district=?", [district]).fetchone()
                parts.append(f"District {district}: {wp['c']} water points, {wp['b'] or 0} beneficiaries.")

        if any(w in msg_lower for w in ["quality", "contamination", "safe", "ph", "ecoli", "e.coli", "turbidity"]):
            unsafe = conn.execute("SELECT COUNT(*) FROM water_quality_tests WHERE overall_safe=0 AND tested_at > datetime('now','-30 days')").fetchone()[0]
            parts.append(f"Water quality: {unsafe} unsafe sources in the last 30 days.")

        if any(w in msg_lower for w in ["drought", "rainfall", "climate", "flood", "spi", "forecast"]):
            drought = conn.execute("SELECT severity, COUNT(*) AS c FROM drought_index GROUP BY severity").fetchall()
            parts.append(f"Drought index: {', '.join(f'{r['c']} {r['severity']}' for r in drought)}.")

        if any(w in msg_lower for w in ["health", "disease", "outbreak", "cholera", "typhoid"]):
            h = conn.execute("SELECT SUM(cases) AS cases, COUNT(*) AS incidents FROM health_incidents WHERE outbreak_status='active'").fetchone()
            parts.append(f"Health: {h['incidents']} active outbreaks, {h['cases'] or 0} total cases.")

        if any(w in msg_lower for w in ["sensor", "iot", "reading", "battery", "offline"]):
            low_bat = conn.execute("SELECT COUNT(*) FROM sensors WHERE battery_level < 20").fetchone()[0]
            offline = conn.execute("SELECT COUNT(*) FROM sensors WHERE status='offline'").fetchone()[0]
            parts.append(f"IoT network: {low_bat} sensors low battery, {offline} offline.")

        if any(w in msg_lower for w in ["budget", "fund", "funding", "allocation", "expenditure", "spend"]):
            try:
                budget_detail = conn.execute("SELECT SUM(amount) AS total, COUNT(*) AS count FROM budget_allocations").fetchone()
                if budget_detail and budget_detail["total"] is not None:
                    parts.append(f"Budget detail: {budget_detail['count']} allocations, total UGX {budget_detail['total']:,.0f}.")
            except Exception:
                pass

        if any(w in msg_lower for w in ["governance", "committee", "wuc", "water user", "council"]):
            try:
                committees = conn.execute("SELECT COUNT(*) FROM water_user_committees").fetchone()[0]
                parts.append(f"Governance: {committees} Water User Committees registered.")
            except Exception:
                pass

        return "\n".join(parts)
    except Exception as e:
        return f"Live system data temporarily unavailable. ({e})"
    finally:
        conn.close()

async def call_gemini_stream(
    message: str,
    history: List[Dict],
    context: str,
    image_data: Optional[str] = None,
    image_mime: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    contents = []
    contents.append({
        "role": "user",
        "parts": [{"text": f"[SYSTEM CONTEXT]\n{context}\n[/SYSTEM CONTEXT]"}]
    })
    contents.append({
        "role": "model",
        "parts": [{"text": "Understood. I have the latest HYDROSENSE system data. How can I help?"}]
    })

    for turn in history[-6:]:
        contents.append({
            "role": "user" if turn["role"] == "user" else "model",
            "parts": [{"text": turn["content"]}]
        })

    current_parts = []
    if image_data and image_mime:
        current_parts.append({
            "inlineData": {
                "mimeType": image_mime,
                "data": image_data,
            }
        })
    text = message.strip() or "Please analyze this image in the context of water management and HYDROSENSE."
    current_parts.append({"text": text})
    contents.append({"role": "user", "parts": current_parts})

    has_image = bool(image_data and image_mime)
    generation_config = {
        "temperature": 0.2 if has_image else 0.3,
        "maxOutputTokens": 2500 if has_image else 1500,
        "topP": 0.9 if has_image else 0.85,
    }

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": contents,
        "generationConfig": generation_config,
    }

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        yield json.dumps({"type": "error", "message": "Gemini API key not configured"})
        return

    max_retries = 2
    base_delay = 2.0
    client = get_http_client()

    for attempt in range(max_retries + 1):
        try:
            async with client.stream(
                "POST",
                GEMINI_URL,
                json=payload,
                params={"key": api_key},
            ) as resp:
                if resp.status_code == 503 and attempt < max_retries:
                    delay = base_delay * (attempt + 1)
                    await asyncio.sleep(delay)
                    continue
                resp.raise_for_status()
                full_text = ""
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or line == "data: [DONE]":
                        continue
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])
                            candidates = data.get("candidates", [])
                            if candidates:
                                parts_data = candidates[0].get("content", {}).get("parts", [])
                                if parts_data:
                                    chunk = parts_data[0].get("text", "")
                                    if chunk:
                                        full_text += chunk
                                        yield json.dumps({"type": "chunk", "text": chunk})
                        except json.JSONDecodeError:
                            continue
                if full_text:
                    yield json.dumps({"type": "done", "full_text": full_text})
                else:
                    yield json.dumps({"type": "error", "message": "Empty response from AI"})
                return
        except httpx.TimeoutException as e:
            if attempt < max_retries:
                await asyncio.sleep(base_delay * (attempt + 1))
                continue
            yield json.dumps({"type": "error", "message": f"AI service timed out: {str(e)[:100]}"})
            return
        except httpx.HTTPStatusError as e:
            code = e.response.status_code if e.response else 0
            body = e.response.text if e.response else ""
            if code == 503 and attempt < max_retries:
                await asyncio.sleep(base_delay * (attempt + 1))
                continue
            if code == 429 or any(kw in body.lower() for kw in ["quota", "billing", "prepayment", "credits"]):
                yield json.dumps({"type": "quota_exceeded", "message": "AI quota exceeded, using rule-based fallback"})
                return
            yield json.dumps({"type": "error", "message": f"AI service error (HTTP {code})", "status_code": code})
            return
        except Exception as e:
            if attempt < max_retries:
                await asyncio.sleep(1)
                continue
            yield json.dumps({"type": "error", "message": f"AI request failed: {str(e)[:200]}"})
            return

# ── Language detection cache ──
_lang_cache: Dict[str, str] = {}
async def detect_user_language(message: str) -> str:
    """Detect the language of the user's message. Returns ISO code."""
    cache_key = message[:100].lower()
    cached = _lang_cache.get(cache_key)
    if cached:
        return cached

    from translation_engine import detect_language as detect
    try:
        code, _ = await detect(message)
        _lang_cache[cache_key] = code
        if len(_lang_cache) > 500:
            _lang_cache.clear()
        return code
    except Exception:
        return "en"


def rule_based_response(message: str, role: str, district: Optional[str], user_lang: str = "en") -> str:
    conn = get_db()
    msg = message.lower()
    try:
        if re.search(r"how are you|how r you|how're you", msg):
            return (
                "I'm fully operational and ready to assist! **Hydro AI** is continuously monitoring "
                "Uganda's water infrastructure in real time.\n\n"
                "Is there something specific you'd like to check \u2014 water point status, alerts, "
                "quality tests, or a maintenance report?"
            )

        if re.search(r"what is your name|who are you|what are you called|your name", msg):
            return (
                "I'm **Hydro AI** \u2014 the assistant powering HYDROSENSE, Uganda's national climate-resilient "
                "rural water management platform.\n\n"
                "I can help you monitor water infrastructure, interpret quality data, track maintenance, "
                "understand climate risks, and more. Type **help** to see everything I can do."
            )

        if re.search(r"hello|hi\b|hey\b|good morning|good afternoon|good evening|greetings|salamu", msg):
            return (
                "Hello! I'm **Hydro AI**, HYDROSENSE's assistant. "
                f"I can help you with water point status, failure predictions, contamination risks, "
                f"climate forecasts, governance, and maintenance planning.\n\n"
                "What would you like to know today?"
            )

        if re.search(r"help|what can you|capabilities|features|what do you do", msg):
            return (
                "**Here is what I can help you with:**\n\n"
                "\u2022 **Water points** \u2014 status, locations, beneficiaries\n"
                "\u2022 **Alerts** \u2014 active emergencies and critical issues\n"
                "\u2022 **Maintenance** \u2014 pending repairs and priorities\n"
                "\u2022 **Water quality** \u2014 contamination risks and test results\n"
                "\u2022 **Climate** \u2014 drought index and rainfall forecasts\n"
                "\u2022 **Health** \u2014 disease outbreaks linked to water sources\n"
                "\u2022 **Sensors / IoT** \u2014 battery, offline status, readings\n"
                "\u2022 **Budget & funding** \u2014 allocation totals and expenditure\n"
                "\u2022 **Governance** \u2014 Water User Committees and district councils\n"
                "\u2022 **Predictions** \u2014 AI failure and contamination risk scores\n"
                "\u2022 **Reports** \u2014 generate structured situation reports\n\n"
                "You can also upload an **image** (pump photo, lab result, dashboard screenshot) for AI analysis.\n\n"
                "Ask me anything about Uganda's water infrastructure!"
            )

        if re.search(r"how many water points|total water points|number of (water|boreholes)", msg):
            total = conn.execute("SELECT COUNT(*) FROM water_points").fetchone()[0]
            func = conn.execute("SELECT COUNT(*) FROM water_points WHERE status='functional'").fetchone()[0]
            nonfunc = total - func
            return (
                f"**Water Point Summary**\n\n"
                f"\u2022 **Total monitored**: {total} water points across 15 Ugandan districts\n"
                f"\u2022 **Functional**: {func} ({round(func / total * 100) if total else 0}%)\n"
                f"\u2022 **Non-functional / needs attention**: {nonfunc}\n\n"
                f"Use the **Water Points** module to view individual statuses, filter by district, or export a full list."
            )

        if re.search(r"\balert|emergency|critical\b", msg):
            alerts = conn.execute("SELECT severity, COUNT(*) AS c FROM alerts WHERE status='active' GROUP BY severity").fetchall()
            summary = ", ".join(f"{r['c']} {r['severity']}" for r in alerts)
            total = sum(r["c"] for r in alerts)
            return (
                f"**Active Alerts \u2014 HYDROSENSE**\n\n"
                f"\u2022 **Total active alerts**: {total}\n"
                f"\u2022 **Breakdown**: {summary}\n\n"
                f"Visit the **Emergency Response** module for details, resolution workflows, and to assign response teams."
            )

        if re.search(r"maintenance|repair|broken|fix", msg):
            pending = conn.execute("SELECT COUNT(*) FROM maintenance_requests WHERE status='pending'").fetchone()[0]
            urgent = conn.execute("SELECT COUNT(*) FROM maintenance_requests WHERE priority='critical' AND status='pending'").fetchone()[0]
            return (
                f"**Maintenance Status**\n\n"
                f"\u2022 **Pending requests**: {pending}\n"
                f"\u2022 **Critical priority**: {urgent}\n\n"
                f"**Recommended actions:**\n"
                f"1. Assign technicians to the {urgent} critical request(s) immediately.\n"
                f"2. Review the remaining {pending - urgent} pending requests and prioritise by district impact.\n"
                f"3. Use the **Maintenance** module to track progress and close completed jobs."
            )

        if re.search(r"quality|contamination|safe|unsafe|e.coli|ecoli|turbidity|ph\b", msg):
            unsafe = conn.execute("SELECT COUNT(*) FROM water_quality_tests WHERE overall_safe=0 AND tested_at > datetime('now','-30 days')").fetchone()[0]
            avg_score = conn.execute("SELECT AVG(water_safety_score) FROM water_quality_tests WHERE tested_at > datetime('now','-30 days')").fetchone()[0]
            return (
                f"**Water Quality Overview (Last 30 Days)**\n\n"
                f"\u2022 **Unsafe test results**: {unsafe}\n"
                f"\u2022 **Average safety score**: {round(avg_score or 0, 1)} / 100\n\n"
                f"**WHO benchmarks**: pH 6.5\u20138.5 | Turbidity < 5 NTU | E.coli 0 CFU/100 mL\n\n"
                f"Use the **Water Quality** module for full contamination maps, individual test records, and alert triggers."
            )

        if re.search(r"drought|rainfall|climate|rain|flood|spi\b", msg):
            drought = conn.execute("SELECT severity, COUNT(*) AS c FROM drought_index GROUP BY severity ORDER BY c DESC").fetchall()
            summary = ", ".join(f"{r['c']} districts {r['severity']}" for r in drought)
            return (
                f"**Climate & Drought Status**\n\n"
                f"\u2022 **Drought index**: {summary}\n\n"
                f"The AI Climate Forecaster provides **6-month projections** with confidence intervals, "
                f"factoring in SPI (Standardised Precipitation Index) and historical rainfall patterns.\n\n"
                f"Access the **Climate Monitor** module for full analysis, district-level forecasts, and early warning triggers."
            )

        if re.search(r"health|disease|outbreak|cholera|typhoid|diarrhea|diarrhoea", msg):
            h = conn.execute("SELECT SUM(cases) AS cases, COUNT(*) AS incidents FROM health_incidents WHERE outbreak_status='active'").fetchone()
            return (
                f"**Health Surveillance**\n\n"
                f"\u2022 **Active outbreaks**: {h['incidents'] or 0}\n"
                f"\u2022 **Total reported cases**: {h['cases'] or 0}\n\n"
                f"The HYDROSENSE AI monitors real-time correlations between water quality failures and disease incidents. "
                f"Visit the **Health Surveillance** module for epidemiological data, outbreak maps, and response coordination."
            )

        if re.search(r"sensor|iot|reading|battery|signal|offline", msg):
            total = conn.execute("SELECT COUNT(*) FROM sensors").fetchone()[0]
            offline = conn.execute("SELECT COUNT(*) FROM sensors WHERE status='offline'").fetchone()[0]
            low_bat = conn.execute("SELECT COUNT(*) FROM sensors WHERE battery_level < 20").fetchone()[0]
            return (
                f"**IoT Sensor Network**\n\n"
                f"\u2022 **Total sensors**: {total} across 7 sensor types\n"
                f"\u2022 **Offline**: {offline}\n"
                f"\u2022 **Low battery (< 20%)**: {low_bat}\n\n"
                f"Sensor data streams update every **30 seconds** via Socket.IO. "
                f"Visit the **IoT Monitoring** module to view live readings, signal maps, and maintenance schedules."
            )

        if re.search(r"beneficiar|people|population|serve|community", msg):
            bens = conn.execute("SELECT SUM(beneficiaries) FROM water_points").fetchone()[0]
            return (
                f"**Community Impact**\n\n"
                f"\u2022 **Total beneficiaries served**: {bens:,} people across 15 districts\n\n"
                f"HYDROSENSE tracks household coverage, seasonal access patterns, and per-capita water availability "
                f"to support Uganda's SDG 6 reporting obligations.\n\n"
                f"View district-level breakdowns in the **Coverage Analytics** module."
            )

        if re.search(r"district|region|area|location|cover", msg):
            districts = conn.execute("SELECT district, COUNT(*) AS c FROM water_points GROUP BY district ORDER BY c DESC").fetchall()
            top = ", ".join(f"{r['district']} ({r['c']})" for r in districts[:5])
            return (
                f"**District Coverage**\n\n"
                f"HYDROSENSE covers **15 districts**: {top}, and more.\n\n"
                f"Each district officer has a personalised dashboard with:\n"
                f"\u2022 Local water point status\n"
                f"\u2022 District-specific AI predictions\n"
                f"\u2022 Maintenance backlogs and technician assignments\n"
                f"\u2022 Climate and health alerts\n\n"
                f"Select a district from the **District Management** module to drill down."
            )

        if re.search(r"predict|forecast|ai|machine learning|risk|failure", msg):
            failures = conn.execute("SELECT COUNT(*) FROM water_points WHERE infrastructure_score < 40").fetchone()[0]
            return (
                f"**AI Prediction Engine**\n\n"
                f"\u2022 **Water points with low infrastructure score (< 40)**: {failures} \u2014 at elevated failure risk\n\n"
                f"**Active AI modules:**\n"
                f"1. Water Failure Prediction\n"
                f"2. Maintenance Forecasting\n"
                f"3. Contamination Risk Scoring\n"
                f"4. Sensor Anomaly Detection\n"
                f"5. 6-Month Climate Forecasting\n\n"
                f"Open the **AI Hub** for the full predictions dashboard, risk maps, and model confidence scores."
            )

        if re.search(r"budget|fund|funding|allocation|expenditure|spend|cost", msg):
            try:
                budget_row = conn.execute("SELECT COUNT(*) AS count, SUM(amount) AS total FROM budget_allocations").fetchone()
                if budget_row and budget_row["total"] is not None:
                    return (
                        f"**Budget & Funding Overview**\n\n"
                        f"\u2022 **Total allocations**: {budget_row['count']}\n"
                        f"\u2022 **Total allocated**: UGX {budget_row['total']:,.0f}\n\n"
                        f"**Recommended actions:**\n"
                        f"1. Review allocation-to-expenditure ratios per district in the **Governance** module.\n"
                        f"2. Flag under-utilised allocations for reallocation before the fiscal deadline.\n"
                        f"3. Cross-reference with maintenance request costs to identify funding gaps.\n\n"
                        f"Budget tracking supports Uganda's MWE reporting requirements and SDG 6 financing commitments."
                    )
            except Exception:
                pass
            return (
                "**Budget & Funding**\n\n"
                "Budget allocation data is managed through the **Governance** module. "
                "Contact your district water officer or the Ministry of Water and Environment (MWE) "
                "for current budget figures and disbursement schedules.\n\n"
                "Typical borehole rehabilitation costs in Uganda range from **UGX 8\u201325 million** depending on depth and pump type."
            )

        if re.search(r"\breport|generate|summarise|summarize|overview\b|situation", msg):
            try:
                total_wp = conn.execute("SELECT COUNT(*) FROM water_points").fetchone()[0]
                func_wp = conn.execute("SELECT COUNT(*) FROM water_points WHERE status='functional'").fetchone()[0]
                alerts = conn.execute("SELECT COUNT(*) FROM alerts WHERE status='active'").fetchone()[0]
                pending = conn.execute("SELECT COUNT(*) FROM maintenance_requests WHERE status='pending'").fetchone()[0]
                unsafe = conn.execute("SELECT COUNT(*) FROM water_quality_tests WHERE overall_safe=0 AND tested_at > datetime('now','-30 days')").fetchone()[0]
                bens = conn.execute("SELECT SUM(beneficiaries) FROM water_points").fetchone()[0] or 0
                date_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
                scope = f"District: {district}" if district else "National"
                return (
                    f"**HYDROSENSE Situation Report \u2014 {date_str}**\n"
                    f"**Scope**: {scope}\n\n"
                    f"**Executive Summary**\n"
                    f"HYDROSENSE is monitoring {total_wp} water points serving {bens:,} beneficiaries. "
                    f"{func_wp} points ({round(func_wp / total_wp * 100) if total_wp else 0}%) are functional. "
                    f"There are {alerts} active alerts and {pending} pending maintenance requests requiring attention.\n\n"
                    f"**Key Metrics**\n"
                    f"\u2022 Water points (functional): {func_wp} / {total_wp}\n"
                    f"\u2022 Active alerts: {alerts}\n"
                    f"\u2022 Pending maintenance: {pending}\n"
                    f"\u2022 Unsafe water tests (30 days): {unsafe}\n"
                    f"\u2022 Total beneficiaries: {bens:,}\n\n"
                    f"**Priority Issues**\n"
                    f"1. {total_wp - func_wp} non-functional water points \u2014 deploy technicians for assessment.\n"
                    f"2. {alerts} active alerts \u2014 review Emergency Response module for resolution status.\n"
                    f"3. {unsafe} recent unsafe water quality tests \u2014 trigger contamination response protocol.\n\n"
                    f"**Recommendations**\n"
                    f"1. **Short-term**: Resolve all critical maintenance requests within 48 hours.\n"
                    f"2. **Medium-term**: Conduct water quality retesting at all flagged sources.\n"
                    f"3. **Long-term**: Increase IoT sensor coverage to reduce manual inspection reliance.\n\n"
                    f"**SDG 6 Alignment Note**\n"
                    f"Current functionality rate of {round(func_wp / total_wp * 100) if total_wp else 0}% is below Uganda's "
                    f"85% rural water access target. Prioritising repairs and preventive maintenance will directly "
                    f"advance SDG 6.1 (universal safe drinking water access) by 2030."
                )
            except Exception as e:
                return f"I was unable to generate a full report at this time due to a database issue: {e}."

        if re.search(r"governance|committee|wuc|water user|council|oversight|accountability", msg):
            try:
                committees = conn.execute("SELECT COUNT(*) FROM water_user_committees").fetchone()[0]
                return (
                    f"**Governance Overview**\n\n"
                    f"\u2022 **Registered Water User Committees (WUCs)**: {committees}\n\n"
                    f"WUCs are community-level governance bodies responsible for day-to-day management of rural water points, "
                    f"fee collection, and first-level maintenance coordination.\n\n"
                    f"Access the **Governance** module for full oversight tools."
                )
            except Exception:
                pass
            return (
                "**Governance & Accountability**\n\n"
                "HYDROSENSE supports transparent water sector governance through Water User Committee tracking, "
                "budget monitoring, performance dashboards, and compliance reporting for MWE.\n\n"
                "Access the **Governance** module for full oversight and accountability tools."
            )

        if re.search(r"train|capacity|workshop|skill|learning|education|technician skill", msg):
            return (
                "**Capacity Building & Training**\n\n"
                "HYDROSENSE supports water sector capacity through technician training, district officer workshops, "
                "community education on hygiene, and national admin briefings on SDG 6 reporting.\n\n"
                "Contact your district water officer to enrol in the next scheduled technician certification cycle."
            )

        role_tip = {
            "national_admin": "As a national administrator, you can also ask me to generate a situation report, check budget allocations, or compare district performance metrics.",
            "district_officer": f"As a district officer{' for ' + district if district else ''}, you can ask me about local water point status, maintenance backlogs, or district-level quality alerts.",
            "technician": "As a technician, you can ask me about pending maintenance requests, sensor diagnostics, repair procedures, or upload a pump photo for AI condition assessment.",
            "citizen": "You can ask me: 'Is the water safe in my area?', 'How do I report a broken borehole?', or 'Where is the nearest clean water point?'",
        }.get(role, "Try asking about water points, alerts, quality, maintenance, climate, health, budget, or governance.")

        return (
            "I'm **Hydro AI**, HYDROSENSE's assistant specialising in Uganda's water infrastructure intelligence.\n\n"
            "I didn't quite find a direct match for your query in my quick-response library, but I can help with:\n"
            "\u2022 Water point status and locations\n"
            "\u2022 Active alerts and emergencies\n"
            "\u2022 Maintenance and repair tracking\n"
            "\u2022 Water quality and contamination risks\n"
            "\u2022 Climate forecasts and drought monitoring\n"
            "\u2022 Budget, governance, and reporting\n\n"
            f"{role_tip}\n\n"
            "Type **help** to see my full capabilities, or rephrase your question and I'll do my best to assist."
        )

    except Exception as e:
        return f"I encountered an issue accessing the database: {e}. Please try again."
    finally:
        conn.close()

async def _translate_to(reply: str, target_lang: str) -> str:
    """Translate a reply to the target language."""
    if target_lang == "en" or not target_lang or target_lang == "en":
        return reply
    try:
        from translation_engine import translate_text
        result = await translate_text(reply, target_lang, "en")
        return result.get("translated_text", reply)
    except Exception:
        return reply


async def chat(
    message: str,
    history: List[Dict],
    role: str,
    district: Optional[str] = None,
    image_data: Optional[str] = None,
    image_mime: Optional[str] = None,
    conversation_context: str = "",
    user_language: str = "en",
) -> Dict:
    cancel_stale_requests(REQUEST_TIMEOUT_SECONDS)
    request_id = str(uuid.uuid4())[:8]

    # Auto-detect language if not specified
    if user_language == "auto" or user_language == "en":
        detected = await detect_user_language(message)
        if detected != "en":
            user_language = detected

    context = build_context(message, role, district)
    if conversation_context:
        context = f"{context}\n\nConversation Memory:\n{conversation_context}"
    has_image = bool(image_data and image_mime)
    model_label = "gemini-2.5-flash"
    start_time = time.time()

    async with request_context(request_id):
        async with _semaphore:
            logger.info(f"[{request_id}] Processing chat request (role={role}, lang={user_language}, has_image={has_image})")

            if time.time() - start_time > REQUEST_TIMEOUT_SECONDS:
                return {
                    "reply": "The AI service is temporarily busy. Please try again.",
                    "source": "timeout",
                    "model": "Hydro AI v4.0",
                    "request_id": request_id,
                }

            if os.getenv("GEMINI_API_KEY", "").strip():
                try:
                    full_text = ""
                    async for chunk_json in call_gemini_stream(message, history, context, image_data, image_mime):
                        try:
                            chunk = json.loads(chunk_json)
                            if chunk.get("type") == "chunk":
                                full_text += chunk.get("text", "")
                            elif chunk.get("type") == "done":
                                full_text = chunk.get("full_text", full_text)
                            elif chunk.get("type") == "quota_exceeded":
                                reply = rule_based_response(message, role, district, user_language)
                                if user_language != "en":
                                    reply = await _translate_to(reply, user_language)
                                return {
                                    "reply": reply,
                                    "source": "rule_based",
                                    "model": "Hydro AI v4.0",
                                    "gemini_status": "quota_exceeded",
                                    "request_id": request_id,
                                    "language": user_language,
                                }
                            elif chunk.get("type") == "error":
                                raise Exception(chunk.get("message", "Unknown error"))
                        except json.JSONDecodeError:
                            continue

                    if full_text:
                        duration = time.time() - start_time
                        logger.info(f"[{request_id}] Gemini response received in {duration:.1f}s")
                        return {
                            "reply": full_text,
                            "source": "gemini",
                            "model": model_label,
                            "analyzed_image": has_image,
                            "request_id": request_id,
                            "duration_ms": int(duration * 1000),
                            "language": user_language,
                        }

                except Exception as exc:
                    logger.error(f"[{request_id}] Gemini call failed: {str(exc)[:200]}")

            reply = rule_based_response(message, role, district, user_language)
            if user_language != "en":
                reply = await _translate_to(reply, user_language)
            return {
                "reply": reply,
                "source": "rule_based" if not os.getenv("GEMINI_API_KEY") else "error_fallback",
                "model": "Hydro AI v4.0",
                "request_id": request_id,
                "language": user_language,
            }

async def chat_stream(
    message: str,
    history: List[Dict],
    role: str,
    district: Optional[str] = None,
    image_data: Optional[str] = None,
    image_mime: Optional[str] = None,
    conversation_context: str = "",
    user_language: str = "en",
) -> AsyncGenerator[str, None]:
    cancel_stale_requests(REQUEST_TIMEOUT_SECONDS)
    request_id = str(uuid.uuid4())[:8]

    if user_language == "auto" or user_language == "en":
        detected = await detect_user_language(message)
        if detected != "en":
            user_language = detected

    context = build_context(message, role, district)
    if conversation_context:
        context = f"{context}\n\nConversation Memory:\n{conversation_context}"
    has_image = bool(image_data and image_mime)

    yield json.dumps({"type": "meta", "request_id": request_id, "has_image": has_image, "language": user_language})

    async with request_context(request_id):
        async with _semaphore:
            if os.getenv("GEMINI_API_KEY", "").strip():
                try:
                    async for chunk_json in call_gemini_stream(message, history, context, image_data, image_mime):
                        yield chunk_json
                    return
                except Exception as exc:
                    logger.error(f"[{request_id}] Stream failed: {str(exc)[:200]}")

            reply = rule_based_response(message, role, district, user_language)
            if user_language != "en":
                reply = await _translate_to(reply, user_language)
            yield json.dumps({"type": "fallback", "text": reply, "language": user_language})
