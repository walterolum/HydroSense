import asyncio
import uuid
import time
import gc
import os
import json
import logging
import sys
from typing import Optional, List, Dict, Any, AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Query, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from intelligence import (
    predict_water_failure, predict_maintenance, predict_contamination,
    detect_anomalies, generate_climate_forecast, generate_smart_alerts,
    get_dashboard, analyze_report, analyze_all_pending,
    get_ai_incident_summary, generate_response_recommendations,
)
from chatbot import chat, chat_stream, get_active_request_count, cancel_stale_requests, MAX_CONCURRENT_REQUESTS, REQUEST_TIMEOUT_SECONDS
from decision_engine import (
    prioritize_incidents, recommend_response_strategy,
    auto_assign_task, escalate_if_needed, generate_operational_insights,
    generate_risk_heatmap_data, get_multi_agency_coordination,
)
from risk_scoring import (
    compute_environmental_risk_index, calculate_water_security_score,
    compute_live_risk_summary, compute_all_district_risk_summary,
)
from conversations import (
    get_conversation, get_conversation_messages, save_message,
    create_conversation, build_conversation_context, log_decision,
    summarize_conversation, ensure_tables_exist, cleanup_orphaned_conversations,
    get_conversation_stats,
)
from multi_modal import (
    analyze_image, analyze_document, transcribe_audio,
    analyze_sms_report, analyze_whatsapp_message, analyze_satellite_imagery,
    classify_pollution_type, verify_report_authenticity,
)
from connection_manager import get_connection_manager, ConnectionState
from ai_diagnostics import get_metrics_collector, DiagnosticsReporter, HealthMonitor
from retry_decorator import retry, CircuitBreaker

# ─────────────────────────────────────────────
# LOGGING CONFIGURATION
# ─────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format='%(asctime)s [HYDROSENSE AI] %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger("hydrosense")

# ─────────────────────────────────────────────
# GLOBALS
# ─────────────────────────────────────────────

_AI_START_TIME = time.time()
_initialized = False
_startup_checks = {}
_gemini_circuit_breaker = CircuitBreaker(
    failure_threshold=3,
    recovery_timeout=30.0,
    half_open_max_calls=1,
    name="gemini_api",
)

metrics = get_metrics_collector()
diagnostics_reporter = DiagnosticsReporter(metrics)
health_monitor = HealthMonitor(check_interval=15.0, collector=metrics)
conn_manager = get_connection_manager()

# ─────────────────────────────────────────────
# RATE LIMITER
# ─────────────────────────────────────────────

class RateLimiter:
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, list] = {}

    def is_allowed(self, client_id: str = "default") -> bool:
        now = time.time()
        window_start = now - self.window_seconds
        if client_id not in self.requests:
            self.requests[client_id] = []
        self.requests[client_id] = [t for t in self.requests[client_id] if t > window_start]
        if len(self.requests[client_id]) >= self.max_requests:
            return False
        self.requests[client_id].append(now)
        return True

rate_limiter = RateLimiter()

# ─────────────────────────────────────────────
# APP LIFECYCLE
# ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _initialized, _startup_checks
    logger.info("=" * 60)
    logger.info("  HYDROSENSE AI Microservice v4.0 — Enterprise Mode")
    logger.info("  Performing startup validation...")

    _startup_checks = await validate_startup()

    if _startup_checks.get("all_checks_passed"):
        logger.info("  All startup checks PASSED")
    else:
        failed = [k for k, v in _startup_checks.items() if isinstance(v, dict) and v.get("status") == "failed"]
        logger.warning(f"  Startup checks: {len(failed)} failure(s): {', '.join(failed)}")

    ensure_tables_exist()
    conn_manager.set_state(ConnectionState.CONNECTED)

    asyncio.create_task(health_monitor.start_monitoring())
    asyncio.create_task(conn_manager.start_cleanup_loop(interval=120.0))
    asyncio.create_task(periodic_report_task())

    logger.info(f"  Gemini API: {'CONFIGURED' if os.getenv('GEMINI_API_KEY') else 'Not configured (rule-based fallback)'}")
    logger.info(f"  Database: {os.getenv('DB_PATH', '../server/watermonitor.db')}")
    logger.info(f"  Max concurrent: {MAX_CONCURRENT_REQUESTS}")
    logger.info(f"  Request timeout: {REQUEST_TIMEOUT_SECONDS}s")
    logger.info("  Hydro AI Engine v4.0 is ONLINE")
    logger.info("=" * 60)

    _initialized = True
    yield

    logger.info("=" * 60)
    logger.info("  Hydro AI Engine shutting down...")
    health_monitor.stop()
    conn_manager.set_state(ConnectionState.DISCONNECTED)
    logger.info("  Shutdown complete.")
    logger.info("=" * 60)

async def validate_startup() -> Dict[str, Any]:
    checks = {}

    # Python version
    py_ok = sys.version_info >= (3, 8)
    checks["python_version"] = {
        "status": "passed" if py_ok else "failed",
        "detail": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    }

    # Database connectivity
    try:
        import sqlite3
        db_path = os.getenv("DB_PATH", "../server/watermonitor.db")
        conn = sqlite3.connect(db_path)
        conn.execute("SELECT 1").fetchone()
        conn.close()
        checks["database"] = {"status": "passed", "detail": db_path}
    except Exception as e:
        checks["database"] = {"status": "failed", "detail": str(e)}

    # Required modules
    required_modules = [
        "fastapi", "uvicorn", "httpx", "dotenv", "PIL",
    ]
    module_results = {}
    for mod in required_modules:
        try:
            __import__(mod.replace("PIL", "PIL"))
            module_results[mod] = True
        except ImportError:
            module_results[mod] = False
    checks["modules"] = {
        "status": "passed" if all(module_results.values()) else "failed",
        "detail": module_results,
    }

    # Performance critical: verify sqlite3 works with WAL
    try:
        conn = sqlite3.connect(":memory:")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.close()
        checks["sqlite_wal"] = {"status": "passed", "detail": "WAL mode supported"}
    except Exception as e:
        checks["sqlite_wal"] = {"status": "failed", "detail": str(e)}

    checks["all_checks_passed"] = all(
        v.get("status") == "passed"
        for v in checks.values()
        if isinstance(v, dict)
    )

    return checks

async def periodic_report_task():
    while True:
        try:
            await asyncio.sleep(3600)
            diagnostics_reporter.save_report()
            cleanup_orphaned_conversations(max_age_hours=48)
        except Exception as e:
            logger.error(f"Periodic task error: {e}")

# ─────────────────────────────────────────────
# APP CREATION
# ─────────────────────────────────────────────

app = FastAPI(
    title="HYDROSENSE AI Service v4.0",
    description="Enterprise Environmental Intelligence Engine — fault-tolerant, self-healing, streaming",
    version="4.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:5173", "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# ─────────────────────────────────────────────
# MIDDLEWARE
# ─────────────────────────────────────────────

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid.uuid4())[:8])
    start = time.time()

    if not rate_limiter.is_allowed(request.client.host if request.client else "default"):
        duration = (time.time() - start) * 1000
        metrics.record_request(request_id, request.url.path, duration, "rate_limited")
        return JSONResponse(
            status_code=429,
            content={"status": "error", "message": "Rate limit exceeded. Try again later.", "retry_after": 60, "request_id": request_id}
        )

    try:
        response = await call_next(request)
        duration = (time.time() - start) * 1000
        metrics.record_request(
            request_id, request.url.path, duration,
            "success" if response.status_code < 500 else "error",
        )
        response.headers["X-Request-ID"] = request_id
        return response
    except HTTPException:
        raise
    except Exception as e:
        duration = (time.time() - start) * 1000
        metrics.record_error(type(e).__name__, str(e)[:100], request.url.path)
        logger.error(f"[{request_id}] Unhandled error on {request.url.path}: {e}")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Internal server error", "request_id": request_id},
        )

# ═══════════════════════════════════════════════
# HEALTH & DIAGNOSTICS
# ═══════════════════════════════════════════════

@app.get("/ai/health")
async def health(request: Request):
    check = await health_monitor.check()
    cb_state = _gemini_circuit_breaker.get_state()
    readback_ok = check.get("db_connected", False)
    all_ok = _initialized and readback_ok and cb_state["state"] not in ("open", "half_open")
    return {
        "status": "ok" if all_ok else "degraded",
        "service": "HYDROSENSE AI Microservice v4.0",
        "version": "4.0.0",
        "uptime_seconds": int(time.time() - _AI_START_TIME),
        "database_connected": readback_ok,
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY", "")),
        "mode": "gemini" if os.getenv("GEMINI_API_KEY") else "rule-based",
        "initialized": _initialized,
        "active_requests": get_active_request_count(),
        "connection_state": conn_manager.state.value,
        "session_id": conn_manager.session_id,
        "startup_checks": _startup_checks,
        "circuit_breaker": {"gemini": cb_state},
        "request_id": request.headers.get("x-request-id", ""),
        "capabilities": [
            "predictive_analytics", "anomaly_detection", "climate_forecasting",
            "multi_modal_analysis", "decision_support", "risk_scoring",
            "incident_prioritization", "auto_escalation", "conversation_memory",
            "image_analysis", "document_analysis", "sms_whatsapp_analysis",
            "satellite_imagery_analysis", "multi_agency_coordination",
            "real_time_chat", "environmental_intelligence", "streaming_chat",
        ],
    }


@app.get("/ai/startup-checks")
async def startup_checks():
    return {"status": "ok", "checks": _startup_checks}


@app.get("/ai/diagnostics")
async def get_diagnostics():
    return {
        "status": "ok",
        "metrics": metrics.get_full_report(),
        "connection": conn_manager.get_diagnostics(),
        "health": health_monitor.status,
    }


@app.get("/ai/diagnostics/report")
async def generate_diagnostics_report():
    diagnostics_reporter.save_report()
    report = diagnostics_reporter.generate_report()
    return {"status": "ok", "report": report}


@app.post("/ai/diagnostics/reset")
async def reset_metrics():
    global metrics
    metrics = get_metrics_collector()
    return {"status": "ok", "message": "Metrics reset"}


@app.post("/ai/system/gc")
async def force_gc():
    gc.collect()
    return {"status": "ok", "message": "Garbage collection triggered"}


@app.get("/ai/system/ping")
async def ping():
    return {"status": "ok", "timestamp": time.time(), "uptime": int(time.time() - _AI_START_TIME)}

# ═══════════════════════════════════════════════
# CHAT ENDPOINTS
# ═══════════════════════════════════════════════

class ChatRequest(BaseModel):
    message: str = ""
    history: List[Dict[str, str]] = []
    role: str = "citizen"
    district: Optional[str] = None
    image_data: Optional[str] = None
    image_mime: Optional[str] = None
    conversation_id: Optional[int] = None
    user_language: str = "en"


async def sse_stream(generator: AsyncGenerator[str, None]):
    async for data in generator:
        yield f"data: {data}\n\n"
    yield "data: {\"type\":\"done\"}\n\n"


@app.post("/ai/chat/stream")
async def chatbot_stream(req: ChatRequest):
    if not req.message.strip() and not req.image_data:
        raise HTTPException(status_code=400, detail="Provide a message or an image.")
    if req.image_data:
        approx_bytes = len(req.image_data) * 3 // 4
        if approx_bytes > 15 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Image too large. Maximum size is 15 MB.")

    cb_state = _gemini_circuit_breaker.get_state()
    if cb_state["state"] == "open":
        async def fallback_stream():
            yield json.dumps({"type": "fallback", "text": "I'm currently in recovery mode. Please try again shortly."})
        return StreamingResponse(
            sse_stream(fallback_stream()),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
        )

    conv_context = ""
    if req.conversation_id:
        conv_context = build_conversation_context(req.conversation_id)

    stream = chat_stream(
        message=req.message.strip(),
        history=req.history,
        role=req.role,
        district=req.district,
        image_data=req.image_data,
        image_mime=req.image_mime or "image/jpeg",
        conversation_context=conv_context,
        user_language=req.user_language,
    )

    return StreamingResponse(
        sse_stream(stream),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/ai/chat")
async def chatbot_endpoint(req: ChatRequest):
    if not req.message.strip() and not req.image_data:
        raise HTTPException(status_code=400, detail="Provide a message or an image.")
    if req.image_data:
        approx_bytes = len(req.image_data) * 3 // 4
        if approx_bytes > 15 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Image too large. Maximum size is 15 MB.")

    cb_state = _gemini_circuit_breaker.get_state()
    if cb_state["state"] == "open":
        logger.warning("Gemini circuit breaker OPEN — using rule-based fallback")
        try:
            from chatbot import rule_based_response
            reply = rule_based_response(req.message.strip() or "Image analysis", req.role, req.district)
        except Exception:
            reply = "I'm currently in recovery mode. Please try again shortly."
        return {
            "status": "ok",
            "reply": reply,
            "source": "circuit_breaker_fallback",
            "model": "Hydro AI v4.0",
        }

    conv_context = ""
    if req.conversation_id:
        conv_context = build_conversation_context(req.conversation_id)

    result = await chat(
        message=req.message.strip(),
        history=req.history,
        role=req.role,
        district=req.district,
        image_data=req.image_data,
        image_mime=req.image_mime or "image/jpeg",
        conversation_context=conv_context,
        user_language=req.user_language,
    )

    source = result.get("source", "")
    is_gemini_failure = source == "error_fallback" or result.get("gemini_status") == "quota_exceeded"
    if is_gemini_failure:
        await _gemini_circuit_breaker._record_failure()
    else:
        await _gemini_circuit_breaker._record_success()

    if req.conversation_id and result.get("reply"):
        save_message(req.conversation_id, "user", req.message, "text")
        save_message(
            req.conversation_id, "assistant", result.get("reply", ""), "text",
            tokens_used=result.get("tokens_used", 0),
        )
    return {"status": "ok", **result}


# ═══════════════════════════════════════════════
# PREDICTIONS
# ═══════════════════════════════════════════════

@app.get("/ai/predictions/failure")
def failure_predictions(district: Optional[str] = Query(None)):
    try:
        data = predict_water_failure(district)
        return {"status": "ok", "count": len(data), "district": district, "predictions": data,
                "critical_count": sum(1 for d in data if d["risk_level"] == "critical"),
                "high_count": sum(1 for d in data if d["risk_level"] == "high")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# MULTILINGUAL TRANSLATION & TRANSCRIPTION
# ═══════════════════════════════════════════════

from pydantic import BaseModel as PydanticBase

class TranslateRequest(BaseModel):
    text: str
    target_language: str = "en"
    source_language: str = "auto"

class TranscribeResponse(BaseModel):
    text: str = ""
    english_translation: str = ""
    detected_language: str = ""
    source: str = ""

@app.post("/ai/translate")
async def translate_endpoint(req: TranslateRequest):
    from translation_engine import translate_text
    result = await translate_text(
        text=req.text,
        target_language=req.target_language,
        source_language=req.source_language,
    )
    return result

@app.post("/ai/transcribe")
async def transcribe_endpoint(request: Request):
    from translation_engine import transcribe_audio
    form = await request.form()
    audio_file = form.get("audio")
    language = form.get("language", "auto")

    if not audio_file:
        return {"text": "", "error": "No audio file provided"}

    audio_bytes = await audio_file.read()
    mime = audio_file.content_type or "audio/webm"
    result = await transcribe_audio(audio_bytes, language=language, mime_type=mime)
    return result

@app.post("/ai/detect-language")
async def detect_language_endpoint(request: Request):
    from translation_engine import detect_language
    body = await request.json()
    text = body.get("text", "")
    if not text:
        return {"language": "en"}
    code = await detect_language(text)
    return {"language": code, "language_name": LANGUAGE_CODES.get(code, code)}

@app.post("/ai/analyze-incident")
async def analyze_incident_endpoint(request: Request):
    from multilingual_incident import analyze_multilingual_report
    body = await request.json()
    result = await analyze_multilingual_report(
        text=body.get("text", ""),
        source_language=body.get("source_language", "auto"),
        district=body.get("district"),
        incident_type=body.get("incident_type"),
    )
    return result


LANGUAGE_CODES = {
    "en": "English", "lug": "Luganda", "nyn": "Runyankole",
    "teo": "Ateso", "luo": "Luo", "lgg": "Lugbara",
    "xog": "Lusoga", "cgg": "Rukiga", "ach": "Acholi", "swa": "Swahili",
}

# ═══════════════════════════════════════════════
# PREDICTIONS
# ═══════════════════════════════════════════════

@app.get("/ai/predictions/maintenance")
def maintenance_predictions(district: Optional[str] = Query(None)):
    try:
        data = predict_maintenance(district)
        return {"status": "ok", "count": len(data), "district": district, "predictions": data,
                "immediate": sum(1 for d in data if d["priority"] == "immediate"),
                "urgent": sum(1 for d in data if d["priority"] == "urgent")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/predictions/contamination")
def contamination_predictions(district: Optional[str] = Query(None)):
    try:
        data = predict_contamination(district)
        return {"status": "ok", "count": len(data), "district": district, "predictions": data,
                "high_risk": sum(1 for d in data if d["risk_level"] in ("critical", "high"))}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/anomalies")
def anomalies(district: Optional[str] = Query(None)):
    try:
        data = detect_anomalies(district)
        return {"status": "ok", "count": len(data), "district": district, "anomalies": data,
                "critical": sum(1 for a in data if a["severity"] == "critical"),
                "high": sum(1 for a in data if a["severity"] == "high")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/climate/forecast")
def climate_forecast(district: Optional[str] = Query(None)):
    try:
        data = generate_climate_forecast(district)
        return {"status": "ok", "district": district, **data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/smart-alerts")
def smart_alerts(district: Optional[str] = Query(None)):
    try:
        data = generate_smart_alerts(district)
        return {"status": "ok", "count": len(data), "district": district, "alerts": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/dashboard/{role}")
def ai_dashboard(role: str, district: Optional[str] = Query(None)):
    valid_roles = {
        "national_admin", "district_officer", "community_committee",
        "citizen", "ngo_officer", "technician", "health_officer", "climate_scientist",
    }
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Unknown role: {role}")
    try:
        return {"status": "ok", **get_dashboard(role, district)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# REPORT GENERATION
# ═══════════════════════════════════════════════

class ReportRequest(BaseModel):
    report_type: str = "executive_summary"
    role: str = "national_admin"
    district: Optional[str] = None


@app.post("/ai/reports/generate")
async def generate_report(req: ReportRequest):
    try:
        dashboard_data = get_dashboard(req.role, req.district)
        ai_sum = dashboard_data.get("ai_summary", {})
        sys_stats = dashboard_data.get("system_stats", {})
        climate = dashboard_data.get("climate_outlook", {})
        recs = dashboard_data.get("ai_recommendations", [])
        scope = f"District: {req.district}" if req.district else "National (All Districts)"
        report = {
            "title": f"HYDROSENSE AI {req.report_type.replace('_', ' ').title()} Report",
            "generated_at": dashboard_data["generated_at"],
            "scope": scope, "role": req.role,
            "executive_summary": (
                f"As of {dashboard_data['generated_at'][:10]}, HYDROSENSE AI has analysed "
                f"{sys_stats.get('total_water_points', 0)} water points across {scope}. "
                f"{ai_sum.get('critical_failure_risk', 0)} sites are at critical failure risk, "
                f"{ai_sum.get('contamination_hotspots', 0)} contamination hotspots were detected, "
                f"and {ai_sum.get('sensor_anomalies', 0)} sensor anomalies are flagged."
            ),
            "key_findings": [
                f"Critical failure risk: {ai_sum.get('critical_failure_risk', 0)} water points",
                f"High failure risk: {ai_sum.get('high_failure_risk', 0)} water points",
                f"Contamination hotspots: {ai_sum.get('contamination_hotspots', 0)} sites",
                f"Sensor anomalies: {ai_sum.get('sensor_anomalies', 0)} detected",
                f"Smart alerts generated: {ai_sum.get('smart_alerts_generated', 0)}",
                f"Climate outlook: {climate.get('outlook', 'N/A').replace('_', ' ')}",
            ],
            "recommendations": recs,
            "top_risks": dashboard_data.get("top_predictions", [])[:5],
            "smart_alerts": dashboard_data.get("smart_alerts", [])[:5],
        }
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        if gemini_key:
            narrative_prompt = (
                f"Write a 3-paragraph executive summary for a water management report. "
                f"Scope: {scope}. Key stats: {ai_sum}. Climate: {climate}. "
                f"Recommendations: {recs}. Keep it professional, concise, and action-oriented."
            )
            try:
                result = await chat(narrative_prompt, [], "national_admin", district=scope, conversation_context="")
                if result and result.get("reply"):
                    report["narrative"] = result["reply"]
            except Exception:
                pass
        return {"status": "ok", "report": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# INCIDENT ANALYSIS
# ═══════════════════════════════════════════════

@app.get("/ai/incident-analysis/summary")
def incident_analysis_summary():
    import sqlite3
    db_path = os.getenv("DB_PATH", "../server/watermonitor.db")
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        data = get_ai_incident_summary(conn)
        conn.close()
        return {"status": "ok", **data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/incident-analysis/analyze/{report_id}")
def analyze_single_report(report_id: int):
    import sqlite3
    db_path = os.getenv("DB_PATH", "../server/watermonitor.db")
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        result = analyze_report(report_id, conn)
        conn.close()
        return {"status": "ok", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/incident-analysis/analyze-all")
async def analyze_all_reports():
    import sqlite3
    db_path = os.getenv("DB_PATH", "../server/watermonitor.db")
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        results = analyze_all_pending(conn)
        conn.close()
        return {"status": "ok", "analyzed": len(results), "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/incident-analysis/recommendations")
def get_recommendations(category: str = Query(...), severity: str = Query("medium"), district: str = Query(...)):
    try:
        recs = generate_response_recommendations(category, severity, district)
        return {"status": "ok", "recommendations": recs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# DECISION SUPPORT
# ═══════════════════════════════════════════════

@app.get("/ai/decision/prioritize-incidents")
def get_prioritized_incidents(limit: int = Query(20)):
    try:
        data = prioritize_incidents(limit)
        return {"status": "ok", "count": len(data), "incidents": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/decision/response-strategy")
def get_response_strategy(
    incident_type: str = Query(...),
    severity: str = Query("medium"),
    district: str = Query(...),
    affected_population: int = Query(0),
):
    try:
        data = recommend_response_strategy(incident_type, severity, district, affected_population)
        return {"status": "ok", "strategy": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AssignRequest(BaseModel):
    incident: Dict[str, Any]


@app.post("/ai/decision/auto-assign")
def auto_assign(req: AssignRequest):
    try:
        data = auto_assign_task(req.incident)
        return {"status": "ok", "assignment": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class EscalateRequest(BaseModel):
    incident: Dict[str, Any]


@app.post("/ai/decision/escalate")
def escalate(req: EscalateRequest):
    try:
        data = escalate_if_needed(req.incident)
        return {"status": "ok", "escalation": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/decision/operational-insights")
def operational_insights(district: Optional[str] = Query(None)):
    try:
        data = generate_operational_insights(district)
        return {"status": "ok", "insights": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# RISK & HEATMAP
# ═══════════════════════════════════════════════

@app.get("/ai/risk/heatmap")
def risk_heatmap(district: Optional[str] = Query(None)):
    try:
        data = generate_risk_heatmap_data(district)
        return {"status": "ok", "count": len(data), "heatmap": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/risk/environmental-index")
def environmental_risk_index(district: Optional[str] = Query(None)):
    try:
        data = compute_environmental_risk_index(district)
        return {"status": "ok", "risk_index": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/risk/water-security")
def water_security(district: Optional[str] = Query(None)):
    try:
        data = calculate_water_security_score(district)
        return {"status": "ok", "water_security": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/risk/live-summary")
def live_risk_summary():
    try:
        data = compute_live_risk_summary()
        return {"status": "ok", "live_summary": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/risk/district-summaries")
def district_risk_summaries():
    try:
        data = compute_all_district_risk_summary()
        return {"status": "ok", "count": len(data), "summaries": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/agency/coordination")
def agency_coordination(incident_id: Optional[int] = Query(None)):
    try:
        data = get_multi_agency_coordination(incident_id)
        return {"status": "ok", "count": len(data), "assignments": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# MULTI-MODAL ANALYSIS
# ═══════════════════════════════════════════════

class MultiModalRequest(BaseModel):
    text: str = ""
    context: Optional[str] = None
    data: Optional[str] = None


@app.post("/ai/analyze/image")
async def analyze_image_endpoint(req: MultiModalRequest):
    try:
        result = await analyze_image(req.data or "", "image/jpeg", req.text or "")
        return {"status": "ok", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/analyze/document")
async def analyze_document_endpoint(req: MultiModalRequest):
    try:
        result = await analyze_document(req.text, req.context or "report")
        return {"status": "ok", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/analyze/sms")
async def analyze_sms_endpoint(req: MultiModalRequest):
    try:
        from translation_engine import analyze_sms_report
        result = await analyze_sms_report(req.text)
        return {"status": "ok", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/analyze/whatsapp")
async def analyze_whatsapp_endpoint(req: MultiModalRequest):
    try:
        from translation_engine import analyze_whatsapp_report
        result = await analyze_whatsapp_report(req.text, req.context or "")
        return {"status": "ok", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# ENHANCED MULTILINGUAL ENDPOINTS
# ═══════════════════════════════════════════════

class BatchTranslateRequest(BaseModel):
    texts: List[str]
    target_language: str = "en"
    source_language: str = "auto"

@app.post("/ai/translate/batch")
async def batch_translate_endpoint(req: BatchTranslateRequest):
    from translation_engine import batch_translate
    try:
        results = await batch_translate(req.texts, req.target_language, req.source_language)
        return {"status": "ok", "texts": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TranslateNotificationRequest(BaseModel):
    message: str
    target_language: str = "en"
    include_summary: bool = True

@app.post("/ai/translate/notification")
async def translate_notification_endpoint(req: TranslateNotificationRequest):
    from translation_engine import translate_report_notification
    try:
        result = await translate_report_notification(req.message, req.target_language, req.include_summary)
        return {"status": "ok", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# ENHANCED INCIDENT ANALYSIS & AUTO-ASSIGNMENT
# ═══════════════════════════════════════════════

class EnhancedAnalysisRequest(BaseModel):
    text: str
    source_language: str = "auto"
    district: Optional[str] = None
    sub_county: Optional[str] = None
    village: Optional[str] = None
    incident_type: Optional[str] = None
    channel: str = "app"
    original_text: Optional[str] = None

@app.post("/ai/incident-analysis/enhanced-analyze")
async def enhanced_analyze_incident(req: EnhancedAnalysisRequest):
    from multilingual_incident import analyze_multilingual_report
    try:
        result = await analyze_multilingual_report(
            text=req.text,
            source_language=req.source_language,
            district=req.district,
            sub_county=req.sub_county,
            village=req.village,
            incident_type=req.incident_type,
            channel=req.channel,
            original_text=req.original_text,
        )
        return {"status": "ok", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/incident-analysis/auto-assign/{report_id}")
async def auto_assign_report(report_id: int):
    from auto_assignment import auto_assign_report as assign
    try:
        result = assign(report_id)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Assignment failed"))
        return {"status": "ok", **result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/assignment/officers")
def list_officers(district: str = Query(...), incident_type: str = Query("other")):
    from auto_assignment import get_available_officers
    try:
        officers = get_available_officers(district, incident_type)
        return {"status": "ok", "count": len(officers), "officers": officers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/assignment/officer-stats")
def officer_stats(district: Optional[str] = Query(None)):
    from auto_assignment import get_officer_stats
    try:
        stats = get_officer_stats(district)
        return {"status": "ok", "officers": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# MULTI-CHANNEL NOTIFICATIONS
# ═══════════════════════════════════════════════

class NotificationRequest(BaseModel):
    recipient_id: int
    recipient_contact: str = ""
    channel: str = "in_app"
    template_name: str = "report_submitted"
    language: str = "en"
    report_id: Optional[int] = None
    category: str = ""
    district: str = ""
    severity: str = "medium"
    status: str = ""
    note: str = ""
    ticket: str = ""
    description: str = ""
    incident_id: Optional[int] = None

@app.post("/ai/notifications/send")
async def send_notification_endpoint(req: NotificationRequest):
    from notifications import (
        send_report_submitted_notification,
        send_status_update_notification,
        send_task_assigned_notification,
    )
    try:
        if req.template_name == "report_submitted":
            result = await send_report_submitted_notification(
                req.report_id or 0, req.recipient_id, req.category, req.district,
                req.language, req.recipient_contact, req.channel,
            )
        elif req.template_name == "status_update":
            result = await send_status_update_notification(
                req.report_id or 0, req.recipient_id, req.status, req.note,
                req.language, req.recipient_contact,
            )
        elif req.template_name == "task_assigned":
            result = await send_task_assigned_notification(
                req.recipient_id, req.category, req.severity, req.district,
                req.ticket, req.description, req.recipient_contact, req.channel,
            )
        else:
            from notifications import send_notification
            result = await send_notification(
                req.recipient_id, req.recipient_contact, req.channel,
                req.template_name, req.language,
                report_id=req.report_id, category=req.category, district=req.district,
                severity=req.severity, status=req.status, note=req.note,
                ticket=req.ticket, description=req.description,
            )
        return {"status": "ok" if result.get("success") else "error", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class BroadcastRequest(BaseModel):
    district: str
    template_name: str = "emergency_alert"
    channel: str = "sms"
    category: str = ""
    severity: str = "high"
    description: str = ""
    report_id: Optional[int] = None

@app.post("/ai/notifications/broadcast")
async def broadcast_notification(req: BroadcastRequest):
    from notifications import broadcast_to_district
    try:
        result = await broadcast_to_district(
            req.district, req.template_name, req.channel,
            category=req.category, severity=req.severity,
            description=req.description, report_id=req.report_id,
        )
        return {"status": "ok" if result.get("success") else "error", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/notifications/stats")
def notification_stats(days: int = Query(7)):
    from notifications import get_delivery_stats
    try:
        stats = get_delivery_stats(days)
        return {"status": "ok", "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class EmergencyAlertRequest(BaseModel):
    recipient_ids: List[int]
    category: str
    severity: str = "critical"
    district: str
    description: str = ""

@app.post("/ai/notifications/emergency")
async def send_emergency(req: EmergencyAlertRequest):
    from notifications import send_emergency_alert
    try:
        results = await send_emergency_alert(
            req.recipient_ids, req.category, req.severity, req.district, req.description,
        )
        return {"status": "ok", "sent": len(results), "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/analyze/satellite")
async def analyze_satellite_endpoint(req: MultiModalRequest):
    try:
        coords = json.loads(req.context) if req.context else None
        result = await analyze_satellite_imagery(req.text, coords)
        return {"status": "ok", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class PollutionClassifyRequest(BaseModel):
    description: str
    image_analysis: Optional[str] = ""


@app.post("/ai/analyze/pollution-classify")
async def pollution_classify_endpoint(req: PollutionClassifyRequest):
    try:
        result = await classify_pollution_type(req.description, req.image_analysis)
        return {"status": "ok", "classification": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class VerifyRequest(BaseModel):
    report_text: str
    image_analysis: Optional[str] = ""
    location_data: Optional[Dict[str, Any]] = None


@app.post("/ai/analyze/verify-report")
async def verify_report_endpoint(req: VerifyRequest):
    try:
        result = await verify_report_authenticity(req.report_text, req.image_analysis, req.location_data)
        return {"status": "ok", "verification": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# CONVERSATION MANAGEMENT
# ═══════════════════════════════════════════════

@app.post("/ai/conversations/create")
def create_conv(
    title: str = Form("New Chat"),
    user_id: int = Form(...),
    role: str = Form(...),
    district: Optional[str] = Form(None),
    category: str = Form("general"),
):
    try:
        conv_id = create_conversation(title, user_id, role, district, category)
        return {"status": "ok", "conversation_id": conv_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/conversations/{conversation_id}/context")
def get_conv_context(conversation_id: int):
    try:
        context = build_conversation_context(conversation_id)
        return {"status": "ok", "context": context}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/conversations/{conversation_id}/summarize")
def summarize_conv(conversation_id: int):
    try:
        summary = summarize_conversation(conversation_id)
        return {"status": "ok", "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/conversations/stats")
def conversation_stats(user_id: Optional[int] = Query(None)):
    try:
        stats = get_conversation_stats(user_id)
        return {"status": "ok", "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class DecisionLogRequest(BaseModel):
    decision_type: str
    input_data: Optional[Dict[str, Any]] = None
    output_data: Optional[Dict[str, Any]] = None
    confidence_score: float = 0.0
    user_id: Optional[int] = None
    role: Optional[str] = None
    district: Optional[str] = None


@app.post("/ai/decision/log")
def log_decision_endpoint(req: DecisionLogRequest):
    try:
        log_decision(
            req.decision_type, req.input_data, req.output_data,
            req.confidence_score, req.user_id, req.role, req.district,
        )
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    port = int(os.getenv("PORT", 8000))
    gemini_status = "Configured" if os.getenv("GEMINI_API_KEY") else "Not configured (rule-based fallback active)"
    print("\n" + "=" * 60)
    print("  HYDROSENSE AI Microservice v4.0")
    print("  Enterprise Environmental Intelligence Engine")
    print(f"  Running at : http://localhost:{port}")
    print(f"  API Docs   : http://localhost:{port}/docs")
    print(f"  Health     : http://localhost:{port}/ai/health")
    print(f"  Gemini     : {gemini_status}")
    print("=" * 60 + "\n")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, loop="asyncio")
