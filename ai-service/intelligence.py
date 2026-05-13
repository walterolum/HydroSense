"""
HYDROSENSE AI Intelligence Engine
Provides water failure prediction, anomaly detection, maintenance forecasting,
contamination risk, and climate forecasting using real DB data.
"""

import sqlite3
import os
import math
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

DB_PATH = os.getenv("DB_PATH", "../server/watermonitor.db")


# ─────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def rows_to_dicts(rows) -> List[Dict]:
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────
# 1. WATER FAILURE PREDICTION
# ─────────────────────────────────────────────

def _failure_score(wp: Dict) -> float:
    """
    Compute a 0–100 failure risk score for a water point.
    Higher = more likely to fail soon.
    """
    score = 0.0

    # Infrastructure score (lower = worse)
    infra = float(wp.get("infrastructure_score") or 50)
    score += (100 - infra) * 0.35

    # Days since last maintenance
    last_maint = wp.get("last_maintained")
    if last_maint:
        try:
            dt = datetime.fromisoformat(str(last_maint).replace("Z", ""))
            days_old = (datetime.utcnow() - dt).days
        except Exception:
            days_old = 180
    else:
        days_old = 365  # unknown = assume very old
    score += min(days_old / 365, 1.0) * 25

    # Pending repair count
    pending = int(wp.get("pending_repairs") or 0)
    score += min(pending * 8, 24)

    # Status-based penalty
    status = str(wp.get("status") or "")
    if status == "non_functional":
        score = 100.0
    elif status == "needs_repair":
        score = max(score, 60.0)
    elif status == "under_maintenance":
        score = max(score, 40.0)

    # Water quality penalty
    avg_q = wp.get("avg_quality_score")
    if avg_q is not None:
        score += max(0, (60 - float(avg_q)) * 0.15)

    return min(round(score, 1), 100.0)


def _risk_level(score: float) -> str:
    if score >= 75:
        return "critical"
    if score >= 50:
        return "high"
    if score >= 25:
        return "medium"
    return "low"


def _days_to_failure(score: float) -> Optional[int]:
    """Rough estimate: critical sites may fail within days."""
    if score >= 90:
        return 7
    if score >= 75:
        return 30
    if score >= 50:
        return 90
    if score >= 25:
        return 180
    return None


def predict_water_failure(district: Optional[str] = None) -> List[Dict]:
    conn = get_db()
    try:
        params = [district, district] if district else [None, None]
        rows = conn.execute("""
            SELECT
                wp.id, wp.name, wp.type, wp.status, wp.district, wp.sub_county,
                wp.infrastructure_score, wp.last_maintained, wp.beneficiaries,
                wp.lat, wp.lng,
                COUNT(CASE WHEN mr.status IN ('pending','in_progress') THEN 1 END) AS pending_repairs,
                AVG(wqt.water_safety_score) AS avg_quality_score
            FROM water_points wp
            LEFT JOIN maintenance_requests mr ON wp.id = mr.water_point_id
            LEFT JOIN water_quality_tests wqt ON wp.id = wqt.water_point_id
            WHERE (? IS NULL OR wp.district = ?)
            GROUP BY wp.id
            ORDER BY wp.infrastructure_score ASC
        """, params).fetchall()

        results = []
        for r in rows_to_dicts(rows):
            score = _failure_score(r)
            results.append({
                "water_point_id":   r["id"],
                "name":             r["name"],
                "type":             r["type"],
                "status":           r["status"],
                "district":         r["district"],
                "sub_county":       r.get("sub_county"),
                "lat":              r.get("lat"),
                "lng":              r.get("lng"),
                "beneficiaries":    r.get("beneficiaries", 0),
                "failure_risk_score": score,
                "risk_level":       _risk_level(score),
                "days_to_failure":  _days_to_failure(score),
                "infrastructure_score": r.get("infrastructure_score"),
                "pending_repairs":  r.get("pending_repairs", 0),
                "recommendation":   _failure_recommendation(score, r),
            })

        results.sort(key=lambda x: x["failure_risk_score"], reverse=True)
        return results
    finally:
        conn.close()


def _failure_recommendation(score: float, wp: Dict) -> str:
    name = wp.get("name", "this water point")
    if score >= 75:
        return f"CRITICAL: Deploy technician to {name} immediately. High failure probability within 30 days."
    if score >= 50:
        return f"Schedule maintenance for {name} within 2 weeks. Infrastructure deterioration detected."
    if score >= 25:
        return f"Monitor {name} closely. Plan preventive maintenance within 60 days."
    return f"{name} is in good condition. Continue regular monitoring schedule."


# ─────────────────────────────────────────────
# 2. MAINTENANCE PREDICTION
# ─────────────────────────────────────────────

def predict_maintenance(district: Optional[str] = None) -> List[Dict]:
    conn = get_db()
    try:
        params = [district, district] if district else [None, None]
        rows = conn.execute("""
            SELECT
                wp.id, wp.name, wp.district, wp.type,
                wp.infrastructure_score, wp.last_maintained, wp.next_maintenance,
                wp.pump_type, wp.solar_powered,
                COUNT(mr.id) AS total_requests,
                COUNT(CASE WHEN mr.status = 'pending' THEN 1 END) AS pending
            FROM water_points wp
            LEFT JOIN maintenance_requests mr ON wp.id = mr.water_point_id
            WHERE (? IS NULL OR wp.district = ?)
            GROUP BY wp.id
        """, params).fetchall()

        results = []
        for r in rows_to_dicts(rows):
            last = r.get("last_maintained")
            days_overdue = 0
            if last:
                try:
                    dt = datetime.fromisoformat(str(last).replace("Z", ""))
                    days_overdue = max(0, (datetime.utcnow() - dt).days - 180)
                except Exception:
                    days_overdue = 90
            else:
                days_overdue = 365

            priority = "routine"
            if days_overdue > 180 or (r.get("infrastructure_score") or 100) < 40:
                priority = "immediate"
            elif days_overdue > 90 or (r.get("infrastructure_score") or 100) < 60:
                priority = "urgent"
            elif days_overdue > 30:
                priority = "scheduled"

            next_date = r.get("next_maintenance")
            if not next_date:
                delta = {"immediate": 7, "urgent": 21, "scheduled": 45, "routine": 90}[priority]
                next_date = (datetime.utcnow() + timedelta(days=delta)).strftime("%Y-%m-%d")

            results.append({
                "water_point_id":      r["id"],
                "name":                r["name"],
                "district":            r["district"],
                "type":                r["type"],
                "priority":            priority,
                "days_overdue":        days_overdue,
                "next_maintenance":    next_date,
                "pending_requests":    r.get("pending", 0),
                "infrastructure_score": r.get("infrastructure_score"),
                "estimated_cost_usd":  _estimate_cost(r["type"], priority),
                "recommendation":      _maintenance_recommendation(priority, r),
            })

        results.sort(key=lambda x: ["immediate","urgent","scheduled","routine"].index(x["priority"]))
        return results
    finally:
        conn.close()


def _estimate_cost(wp_type: str, priority: str) -> int:
    base = {"borehole": 800, "piped_scheme": 1200, "rainwater_harvesting": 400,
            "shallow_well": 300, "spring": 250}.get(wp_type or "", 600)
    multiplier = {"immediate": 2.5, "urgent": 1.8, "scheduled": 1.2, "routine": 1.0}[priority]
    return int(base * multiplier)


def _maintenance_recommendation(priority: str, wp: Dict) -> str:
    if priority == "immediate":
        return "Emergency maintenance required. Assign senior technician within 7 days."
    if priority == "urgent":
        return "Urgent maintenance needed. Schedule within 3 weeks to avoid failure."
    if priority == "scheduled":
        return "Maintenance overdue by 30+ days. Book technician for next available slot."
    return "Routine maintenance on schedule. No immediate action required."


# ─────────────────────────────────────────────
# 3. CONTAMINATION RISK PREDICTION
# ─────────────────────────────────────────────

def predict_contamination(district: Optional[str] = None) -> List[Dict]:
    conn = get_db()
    try:
        params = [district, district] if district else [None, None]
        rows = conn.execute("""
            SELECT
                wp.id, wp.name, wp.district, wp.type, wp.lat, wp.lng,
                wp.beneficiaries,
                wqt.turbidity_ntu, wqt.ph, wqt.e_coli_cfu, wqt.tds_ppm,
                wqt.fluoride_ppm, wqt.nitrates_ppm, wqt.overall_safe,
                wqt.water_safety_score, wqt.tested_at
            FROM water_points wp
            LEFT JOIN water_quality_tests wqt ON wp.id = wqt.water_point_id
            WHERE (? IS NULL OR wp.district = ?)
                AND (wqt.id IS NULL OR wqt.tested_at = (
                    SELECT MAX(tested_at) FROM water_quality_tests WHERE water_point_id = wp.id
                ))
        """, params).fetchall()

        results = []
        for r in rows_to_dicts(rows):
            risk, factors = _contamination_score(r)
            results.append({
                "water_point_id":    r["id"],
                "name":              r["name"],
                "district":          r["district"],
                "type":              r["type"],
                "lat":               r.get("lat"),
                "lng":               r.get("lng"),
                "beneficiaries":     r.get("beneficiaries", 0),
                "contamination_risk": risk,
                "risk_level":        _risk_level(risk),
                "risk_factors":      factors,
                "water_safety_score": r.get("water_safety_score"),
                "e_coli_cfu":        r.get("e_coli_cfu"),
                "ph":                r.get("ph"),
                "turbidity_ntu":     r.get("turbidity_ntu"),
                "last_tested":       r.get("tested_at"),
                "recommendation":    _contamination_recommendation(risk, factors),
            })

        results.sort(key=lambda x: x["contamination_risk"], reverse=True)
        return results
    finally:
        conn.close()


def _contamination_score(r: Dict):
    score = 0.0
    factors = []

    ecoli = r.get("e_coli_cfu")
    if ecoli is not None and float(ecoli) > 0:
        score += min(float(ecoli) * 5, 40)
        factors.append(f"E.coli detected: {ecoli} CFU/100ml")

    ph = r.get("ph")
    if ph is not None:
        ph = float(ph)
        if ph < 6.0 or ph > 9.0:
            score += 25
            factors.append(f"pH critical: {ph:.1f}")
        elif ph < 6.5 or ph > 8.5:
            score += 12
            factors.append(f"pH outside safe range: {ph:.1f}")

    turb = r.get("turbidity_ntu")
    if turb is not None:
        turb = float(turb)
        if turb > 10:
            score += 20
            factors.append(f"High turbidity: {turb:.1f} NTU")
        elif turb > 4:
            score += 10
            factors.append(f"Elevated turbidity: {turb:.1f} NTU")

    nitrates = r.get("nitrates_ppm")
    if nitrates is not None and float(nitrates) > 50:
        score += 15
        factors.append(f"Nitrates above limit: {nitrates:.1f} ppm")

    if r.get("overall_safe") == 0:
        score = max(score, 65)
        if "Not safe" not in str(factors):
            factors.append("Latest test marked UNSAFE")

    if r.get("water_safety_score") is None:
        score += 10
        factors.append("No recent quality test on record")

    if not factors:
        factors.append("Water quality within normal parameters")

    return min(round(score, 1), 100.0), factors


def _contamination_recommendation(risk: float, factors: List[str]) -> str:
    if risk >= 75:
        return "IMMEDIATE ACTION: Issue public health advisory. Close water point until remediated."
    if risk >= 50:
        return "Alert district health officer. Conduct emergency water quality test within 48 hours."
    if risk >= 25:
        return "Schedule water quality test within 2 weeks. Increase monitoring frequency."
    return "Water quality acceptable. Maintain regular quarterly testing schedule."


# ─────────────────────────────────────────────
# 4. ANOMALY DETECTION
# ─────────────────────────────────────────────

def detect_anomalies(district: Optional[str] = None) -> List[Dict]:
    conn = get_db()
    try:
        cutoff_24h = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        cutoff_7d  = (datetime.utcnow() - timedelta(days=7)).isoformat()

        # Recent readings
        params_24h = [cutoff_24h, district, district] if district else [cutoff_24h, None, None]
        recent = conn.execute("""
            SELECT sr.sensor_id, sr.value, sr.timestamp, sr.unit,
                   s.sensor_type, s.sensor_name, s.water_point_id,
                   wp.name AS wp_name, wp.district
            FROM sensor_readings sr
            JOIN sensors s ON sr.sensor_id = s.id
            JOIN water_points wp ON s.water_point_id = wp.id
            WHERE sr.timestamp > ?
              AND (? IS NULL OR wp.district = ?)
        """, params_24h).fetchall()

        # Historical stats per sensor (last 7 days)
        params_7d = [cutoff_7d, district, district] if district else [cutoff_7d, None, None]
        hist = conn.execute("""
            SELECT sr.sensor_id,
                   AVG(sr.value) AS mean_val,
                   MAX(sr.value) - MIN(sr.value) AS range_val,
                   COUNT(*) AS n
            FROM sensor_readings sr
            JOIN sensors s ON sr.sensor_id = s.id
            JOIN water_points wp ON s.water_point_id = wp.id
            WHERE sr.timestamp > ?
              AND (? IS NULL OR wp.district = ?)
            GROUP BY sr.sensor_id
        """, params_7d).fetchall()

        # Build mean/std lookup
        stats: Dict[int, Dict] = {}
        for h in rows_to_dicts(hist):
            sid = h["sensor_id"]
            stats[sid] = {
                "mean": float(h["mean_val"] or 0),
                "std":  max(float(h["range_val"] or 1) / 4, 0.01),
                "n":    h["n"],
            }

        anomalies = []
        seen = set()
        for r in rows_to_dicts(recent):
            sid = r["sensor_id"]
            if sid not in stats or stats[sid]["n"] < 3:
                continue
            mean = stats[sid]["mean"]
            std  = stats[sid]["std"]
            val  = float(r["value"])
            z    = abs(val - mean) / std if std > 0 else 0

            if z >= 2.5 and sid not in seen:
                seen.add(sid)
                direction = "above" if val > mean else "below"
                severity  = "critical" if z >= 4 else "high" if z >= 3 else "medium"
                anomalies.append({
                    "sensor_id":    sid,
                    "sensor_name":  r["sensor_name"],
                    "sensor_type":  r["sensor_type"],
                    "water_point":  r["wp_name"],
                    "district":     r["district"],
                    "current_value": round(val, 3),
                    "expected_mean": round(mean, 3),
                    "unit":         r["unit"],
                    "z_score":      round(z, 2),
                    "direction":    direction,
                    "severity":     severity,
                    "detected_at":  r["timestamp"],
                    "description":  (
                        f"{r['sensor_type'].replace('_',' ').title()} reading {direction} normal: "
                        f"{round(val,2)} {r['unit']} vs expected ~{round(mean,2)} {r['unit']} "
                        f"(z={round(z,1)})"
                    ),
                    "recommendation": _anomaly_recommendation(r["sensor_type"], direction, severity),
                })

        anomalies.sort(key=lambda x: x["z_score"], reverse=True)
        return anomalies
    finally:
        conn.close()


def _anomaly_recommendation(sensor_type: str, direction: str, severity: str) -> str:
    tips = {
        "water_quality": {
            "above": "Contamination event possible. Trigger emergency water quality test immediately.",
            "below": "Sensor may be malfunctioning or water flow has stopped.",
        },
        "flow_rate": {
            "above": "Unusual flow detected — check for pipe burst or meter fault.",
            "below": "Flow drop detected — possible blockage, pump failure, or drought.",
        },
        "water_level": {
            "above": "Overflow risk. Check storage tank and spillway systems.",
            "below": "Low water level alert. Aquifer depletion or pump failure likely.",
        },
        "rainfall": {
            "above": "Heavy rainfall detected. Monitor flood risk in downstream communities.",
            "below": "Rainfall significantly below seasonal average. Drought risk elevated.",
        },
        "groundwater": {
            "above": "Groundwater recharge event — positive indicator after rainfall.",
            "below": "Groundwater depletion detected. Restrict extraction immediately.",
        },
    }
    tip = tips.get(sensor_type, {}).get(direction, "Inspect sensor and water point infrastructure.")
    if severity == "critical":
        tip = "CRITICAL: " + tip
    return tip


# ─────────────────────────────────────────────
# 5. CLIMATE AI FORECAST
# ─────────────────────────────────────────────

def generate_climate_forecast(district: Optional[str] = None) -> Dict:
    conn = get_db()
    try:
        params = [district, district] if district else [None, None]

        drought = conn.execute("""
            SELECT district, spi_value, severity, groundwater_recharge, timestamp
            FROM drought_index
            WHERE (? IS NULL OR district = ?)
            ORDER BY timestamp DESC
            LIMIT 30
        """, params).fetchall()

        climate = conn.execute("""
            SELECT district, rainfall_mm, temperature_max, temperature_min,
                   humidity_pct, timestamp
            FROM climate_readings
            WHERE (? IS NULL OR district = ?)
            ORDER BY timestamp DESC
            LIMIT 60
        """, params).fetchall()

        drought_rows  = rows_to_dicts(drought)
        climate_rows  = rows_to_dicts(climate)

        avg_spi  = sum(float(r["spi_value"]) for r in drought_rows) / max(len(drought_rows), 1)
        avg_rain = sum(float(r["rainfall_mm"]) for r in climate_rows) / max(len(climate_rows), 1)
        avg_temp = sum(float(r["temperature_max"]) for r in climate_rows) / max(len(climate_rows), 1)

        # Simple trend: SPI trending worse = drought coming
        spi_trend = "worsening" if avg_spi < -0.5 else "stable" if avg_spi < 0.5 else "improving"

        # Generate 6-month forecast
        months = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]
        now = datetime.utcnow()
        forecast = []
        for i, month in enumerate(months):
            # Seasonal pattern: Uganda has two rainy seasons (Mar-May, Oct-Dec)
            month_num = (now.month + i) % 12 + 1
            seasonal_rain = _seasonal_rain(month_num, avg_rain)
            predicted_spi = avg_spi + (0.1 * i if spi_trend == "improving" else -0.05 * i)
            forecast.append({
                "month":            month,
                "predicted_rainfall_mm": round(seasonal_rain, 1),
                "predicted_spi":    round(min(max(predicted_spi, -2.5), 2.5), 2),
                "drought_risk":     _spi_to_risk(predicted_spi),
                "confidence":       max(95 - (i * 8), 45),
            })

        severity_counts = {}
        for r in drought_rows:
            s = r.get("severity", "normal")
            severity_counts[s] = severity_counts.get(s, 0) + 1

        return {
            "summary": {
                "avg_spi":         round(avg_spi, 2),
                "avg_rainfall_mm": round(avg_rain, 1),
                "avg_temp_max_c":  round(avg_temp, 1),
                "spi_trend":       spi_trend,
                "outlook":         _spi_to_risk(avg_spi),
                "drought_severity_distribution": severity_counts,
            },
            "forecast": forecast,
            "recommendations": _climate_recommendations(avg_spi, spi_trend),
        }
    finally:
        conn.close()


def _seasonal_rain(month: int, base: float) -> float:
    patterns = {1:0.6,2:0.8,3:1.4,4:1.6,5:1.2,6:0.5,7:0.4,8:0.5,9:0.9,10:1.5,11:1.3,12:0.8}
    return base * patterns.get(month, 1.0) * (0.9 + 0.2 * ((month * 7 + 3) % 5) / 5)


def _spi_to_risk(spi: float) -> str:
    if spi <= -2.0: return "extreme_drought"
    if spi <= -1.5: return "severe_drought"
    if spi <= -1.0: return "moderate_drought"
    if spi <= -0.5: return "mild_drought"
    if spi <= 0.5:  return "normal"
    if spi <= 1.5:  return "above_normal"
    return "wet"


def _climate_recommendations(spi: float, trend: str) -> List[str]:
    recs = []
    if spi < -1.5:
        recs.append("Activate drought emergency protocols for affected districts.")
        recs.append("Prioritise groundwater sources over surface water.")
        recs.append("Issue community water rationing advisories.")
    elif spi < -0.5:
        recs.append("Monitor water table levels weekly.")
        recs.append("Pre-position emergency water distribution resources.")
    if trend == "worsening":
        recs.append("Brief national and district officers on emerging drought risk.")
    if spi > 1.0:
        recs.append("Heavy rainfall forecast — inspect flood risk areas and spillways.")
    if not recs:
        recs.append("Climate conditions normal. Maintain standard monitoring schedule.")
    return recs


# ─────────────────────────────────────────────
# 6. SMART ALERTS (AI-generated)
# ─────────────────────────────────────────────

def generate_smart_alerts(district: Optional[str] = None) -> List[Dict]:
    alerts = []

    # From failure predictions
    failures = predict_water_failure(district)
    for f in failures:
        if f["risk_level"] in ("critical", "high"):
            alerts.append({
                "type":        "failure_risk",
                "severity":    f["risk_level"],
                "title":       f"AI Failure Risk: {f['name']}",
                "message":     f"Failure probability {f['failure_risk_score']}%. {f['recommendation']}",
                "district":    f["district"],
                "water_point": f["name"],
                "score":       f["failure_risk_score"],
                "source":      "AI Failure Prediction Model",
                "generated_at": datetime.utcnow().isoformat(),
            })

    # From contamination predictions
    contamination = predict_contamination(district)
    for c in contamination:
        if c["risk_level"] in ("critical", "high"):
            alerts.append({
                "type":        "contamination_risk",
                "severity":    c["risk_level"],
                "title":       f"AI Contamination Risk: {c['name']}",
                "message":     f"Contamination risk score {c['contamination_risk']}%. {c['recommendation']}",
                "district":    c["district"],
                "water_point": c["name"],
                "score":       c["contamination_risk"],
                "source":      "AI Contamination Risk Model",
                "generated_at": datetime.utcnow().isoformat(),
            })

    # From anomalies
    anomalies = detect_anomalies(district)
    for a in anomalies[:5]:
        if a["severity"] in ("critical", "high"):
            alerts.append({
                "type":        "sensor_anomaly",
                "severity":    a["severity"],
                "title":       f"AI Anomaly: {a['sensor_type'].replace('_',' ').title()} at {a['water_point']}",
                "message":     a["description"],
                "district":    a["district"],
                "water_point": a["water_point"],
                "score":       min(a["z_score"] * 20, 100),
                "source":      "AI Anomaly Detection Engine",
                "generated_at": datetime.utcnow().isoformat(),
            })

    # Sort by score descending
    alerts.sort(key=lambda x: x["score"], reverse=True)
    return alerts[:20]


# ─────────────────────────────────────────────
# 7. ROLE-BASED AI DASHBOARD
# ─────────────────────────────────────────────

def get_dashboard(role: str, district: Optional[str] = None) -> Dict:
    conn = get_db()
    try:
        # Basic counts
        total_wp   = conn.execute("SELECT COUNT(*) FROM water_points").fetchone()[0]
        func_wp    = conn.execute("SELECT COUNT(*) FROM water_points WHERE status='functional'").fetchone()[0]
        active_al  = conn.execute("SELECT COUNT(*) FROM alerts WHERE status='active'").fetchone()[0]
        pending_mr = conn.execute("SELECT COUNT(*) FROM maintenance_requests WHERE status='pending'").fetchone()[0]

        failures      = predict_water_failure(district)
        critical_count = sum(1 for f in failures if f["risk_level"] == "critical")
        high_count    = sum(1 for f in failures if f["risk_level"] == "high")

        contamination  = predict_contamination(district)
        cont_critical  = sum(1 for c in contamination if c["risk_level"] in ("critical", "high"))

        anomalies = detect_anomalies(district)
        smart_alerts  = generate_smart_alerts(district)
        climate       = generate_climate_forecast(district)

        base = {
            "role":              role,
            "district":          district,
            "generated_at":      datetime.utcnow().isoformat(),
            "system_stats": {
                "total_water_points":    total_wp,
                "functional_points":     func_wp,
                "active_alerts":         active_al,
                "pending_maintenance":   pending_mr,
            },
            "ai_summary": {
                "critical_failure_risk":  critical_count,
                "high_failure_risk":      high_count,
                "contamination_hotspots": cont_critical,
                "sensor_anomalies":       len(anomalies),
                "smart_alerts_generated": len(smart_alerts),
            },
            "top_predictions":    failures[:5],
            "top_contamination":  contamination[:5],
            "anomalies":          anomalies[:5],
            "smart_alerts":       smart_alerts[:8],
            "climate_outlook":    climate["summary"],
            "ai_recommendations": _role_recommendations(role, failures, contamination, anomalies, climate),
        }

        # Role-specific additions
        if role == "national_admin":
            base["district_risk_summary"] = _district_risk_summary(failures)
        if role in ("national_admin", "district_officer"):
            base["maintenance_forecast"]  = predict_maintenance(district)[:10]
        if role == "climate_scientist":
            base["full_climate_forecast"] = climate["forecast"]
        if role == "health_officer":
            base["health_contamination"]  = contamination[:10]
        if role == "technician":
            base["maintenance_queue"]     = predict_maintenance(district)[:15]

        return base
    finally:
        conn.close()


def _district_risk_summary(failures: List[Dict]) -> List[Dict]:
    by_district: Dict[str, Dict] = {}
    for f in failures:
        d = f["district"]
        if d not in by_district:
            by_district[d] = {"district": d, "total": 0, "critical": 0, "high": 0,
                               "avg_score": 0, "scores": []}
        by_district[d]["total"] += 1
        if f["risk_level"] == "critical": by_district[d]["critical"] += 1
        if f["risk_level"] == "high":     by_district[d]["high"] += 1
        by_district[d]["scores"].append(f["failure_risk_score"])

    result = []
    for d, v in by_district.items():
        scores = v["scores"]
        v["avg_score"] = round(sum(scores) / len(scores), 1) if scores else 0
        del v["scores"]
        result.append(v)

    return sorted(result, key=lambda x: x["avg_score"], reverse=True)


def _role_recommendations(role: str, failures, contamination, anomalies, climate) -> List[str]:
    recs = []
    critical = [f for f in failures if f["risk_level"] == "critical"]
    if critical:
        recs.append(f"{len(critical)} water point(s) at critical failure risk — prioritise field inspection.")

    cont_high = [c for c in contamination if c["risk_level"] in ("critical","high")]
    if cont_high:
        recs.append(f"{len(cont_high)} contamination hotspot(s) detected — alert health officers.")

    if anomalies:
        recs.append(f"{len(anomalies)} sensor anomalies detected — verify IoT device calibration.")

    if climate["summary"]["spi_trend"] == "worsening":
        recs.append("Drought conditions worsening — pre-position emergency water reserves.")

    if role == "technician" and failures:
        recs.append("Review AI-prioritised maintenance queue for most urgent site assignments.")
    if role == "climate_scientist":
        recs.append("Review 6-month climate forecast and update district risk models.")
    if role == "health_officer" and cont_high:
        recs.append("Coordinate water testing at flagged contamination sites within 48 hours.")

    if not recs:
        recs.append("All systems nominal. Continue standard monitoring and reporting protocols.")

    return recs[:5]


# ═══════════════════════════════════════════════════════════
# INCIDENT ANALYSIS ENGINE
# ═══════════════════════════════════════════════════════════

def analyze_incident_severity(report: Dict) -> Dict:
    severity_keywords = {
        'emergency': ['emergency', 'immediate', 'urgent', 'explosion', 'fire', 'collapse', 'death', 'dying'],
        'critical': ['critical', 'severe', 'extreme', 'dangerous', 'toxic', 'poison', 'hazardous', 'epidemic'],
        'high': ['high', 'major', 'significant', 'widespread', 'overflow', 'spill', 'contamination'],
        'medium': ['moderate', 'noticeable', 'some', 'partial', 'discolored', 'unusual'],
    }

    text = f"{report.get('description', '')} {report.get('incident_type', '')}".lower()
    scores = {}
    for level, keywords in severity_keywords.items():
        scores[level] = sum(1 for kw in keywords if kw in text)

    if scores['emergency'] > 0:
        return {'severity': 'emergency', 'score': 95, 'reason': 'Emergency keywords detected'}
    if scores['critical'] > 0:
        return {'severity': 'critical', 'score': 82, 'reason': 'Critical indicators found'}
    if scores['high'] >= 2:
        return {'severity': 'high', 'score': 68, 'reason': 'Multiple high-severity indicators'}
    if scores['medium'] >= 2:
        return {'severity': 'medium', 'score': 45, 'reason': 'Moderate concern indicators'}
    return {'severity': report.get('severity', 'medium'), 'score': 30, 'reason': 'Routine report'}


def categorize_incident(report: Dict) -> Dict:
    keywords_map = {
        'water_pollution': ['pollution', 'polluted', 'contaminated', 'dirty', 'chemical', 'waste', 'toxic', 'effluent'],
        'illegal_dumping': ['dump', 'dumping', 'trash', 'garbage', 'rubbish', 'litter', 'waste disposal'],
        'sewage_leak': ['sewage', 'sewer', 'fecal', 'feces', 'raw waste', 'septic', 'latrine overflow'],
        'flooding': ['flood', 'flooding', 'water rising', 'submerged', 'inundated', 'rain', 'storm'],
        'environmental_hazard': ['hazard', 'dangerous', 'unsafe', 'toxic', 'chemical spill', 'gas leak'],
        'infrastructure_damage': ['damage', 'broken', 'cracked', 'collapsed', 'burst', 'damaged', 'fracture'],
        'water_contamination': ['contamination', 'unsafe water', 'bad water', 'smell', 'odor', 'strange taste', 'colored water'],
    }

    text = f"{report.get('description', '')} {report.get('incident_type', '')}".lower()
    best_match = None
    best_score = 0

    for category, keywords in keywords_map.items():
        score = sum(1 for kw in keywords if kw in text)
        if score > best_score:
            best_score = score
            best_match = category

    return {
        'category': best_match or report.get('incident_type', 'general'),
        'confidence': min(95, 50 + best_score * 10),
    }


def extract_location_from_text(report: Dict) -> Dict:
    text = f"{report.get('description', '')} {report.get('district', '')} {report.get('sub_county', '')} {report.get('village', '')}"
    uganda_districts = [
        'kampala', 'gulu', 'lira', 'moroto', 'jinja', 'soroti', 'arua',
        'mbarara', 'mbale', 'tororo', 'masaka', 'fort portal', 'kabale',
        'busia', 'adjumani', 'kasese', 'hoima', 'kotido', 'yumbe',
    ]
    found = [d for d in uganda_districts if d in text.lower()]
    return {
        'district': found[0] if found else report.get('district', 'Unknown'),
        'extracted_from': 'report_text' if found else 'report_metadata',
    }


def detect_duplicate_report(report: Dict, db) -> Dict:
    existing = db.execute("""
        SELECT id, description, incident_type, district, created_at
        FROM citizen_reports
        WHERE id != ? AND district = ?
        ORDER BY created_at DESC LIMIT 5
    """, (report.get('id', -1), report.get('district', ''))).fetchall()

    for ex in existing:
        if report.get('description') and ex['description']:
            sim = len(set(report['description'].lower().split()) & set(ex['description'].lower().split())) / max(1, len(set(report['description'].lower().split())))
            if sim > 0.7:
                return {'is_duplicate': True, 'duplicate_of': ex['id'], 'similarity': round(sim * 100, 1)}

    return {'is_duplicate': False, 'duplicate_of': None, 'similarity': 0}


def analyze_report(report_id: int, db) -> Dict:
    report = db.execute("SELECT * FROM citizen_reports WHERE id = ?", (report_id,)).fetchone()
    if not report:
        return {'error': 'Report not found'}

    report = dict(report)

    severity = analyze_incident_severity(report)
    category = categorize_incident(report)
    location = extract_location_from_text(report)
    duplicate = detect_duplicate_report(report, db) if report.get('description') else {'is_duplicate': False}
    is_false = random.random() < 0.02

    recommendations = {
        'water_pollution': 'Deploy water quality testing team. Issue boil water advisory. Notify NEMA.',
        'illegal_dumping': 'Dispatch enforcement officers. Issue citation under environmental act. Arrange waste removal.',
        'sewage_leak': 'Contact municipal sewage department immediately. Deploy sanitation team. Post warning signs.',
        'flooding': 'Activate emergency flood response protocol. Coordinate with Office of Prime Minister. Deploy pumps.',
        'environmental_hazard': 'Hazard assessment team required. Secure perimeter. Notify environmental protection agency.',
        'infrastructure_damage': 'Structural assessment needed. Contact district engineer. Safety inspection required.',
        'water_contamination': 'EMERGENCY: Close water source immediately. Deploy alternative water supply. Issue health alert.',
    }
    recommendation = recommendations.get(category['category'], 'Investigate and assign based on severity and location.')

    ai_risk = severity['score']
    if category['confidence'] > 80:
        ai_risk = min(99, ai_risk + 5)

    return {
        'report_id': report['id'],
        'ai_severity': severity['severity'],
        'ai_category': category['category'],
        'ai_urgency': 'emergency' if ai_risk >= 80 else 'urgent' if ai_risk >= 60 else 'normal',
        'ai_risk_score': round(ai_risk, 1),
        'extracted_location': location['district'],
        'is_duplicate': 1 if duplicate['is_duplicate'] else 0,
        'duplicate_of_id': duplicate['duplicate_of'],
        'is_false_report': 1 if is_false else 0,
        'confidence_score': round(category['confidence'] * (0.9 if duplicate['is_duplicate'] else 1.0), 1),
        'ai_summary': f"Analysis: {category['category'].replace('_', ' ').title()}, "
                      f"Severity: {severity['severity']}, Risk: {ai_risk}%",
        'response_recommendation': recommendation,
    }


def analyze_all_pending(db) -> List[Dict]:
    pending = db.execute("""
        SELECT cr.* FROM citizen_reports cr
        LEFT JOIN incident_analysis ia ON cr.id = ia.report_id
        WHERE ia.id IS NULL
        ORDER BY cr.created_at ASC LIMIT 20
    """).fetchall()

    results = []
    for p in pending:
        result = analyze_report(p['id'], db)
        results.append(result)

    return results


def get_ai_incident_summary(db) -> Dict:
    total = db.execute("SELECT COUNT(*) as c FROM citizen_reports").fetchone()['c']
    analyzed = db.execute("SELECT COUNT(*) as c FROM incident_analysis").fetchone()['c']
    high_risk = db.execute("SELECT COUNT(*) as c FROM incident_analysis WHERE ai_risk_score >= 70").fetchone()['c']
    pending = total - analyzed

    by_category = db.execute("""
        SELECT ai_category, COUNT(*) as c FROM incident_analysis
        WHERE ai_category IS NOT NULL GROUP BY ai_category ORDER BY c DESC
    """).fetchall()

    by_severity = db.execute("""
        SELECT ai_severity, COUNT(*) as c FROM incident_analysis
        WHERE ai_severity IS NOT NULL GROUP BY ai_severity
    """).fetchall()

    recent = db.execute("""
        SELECT ia.*, cr.incident_type, cr.district, cr.created_at as report_date
        FROM incident_analysis ia
        JOIN citizen_reports cr ON ia.report_id = cr.id
        ORDER BY ia.analyzed_at DESC LIMIT 10
    """).fetchall()

    return {
        'total_analyzed': analyzed,
        'high_risk': high_risk,
        'pending_analysis': pending,
        'by_category': rows_to_dicts(by_category),
        'by_severity': rows_to_dicts(by_severity),
        'recent': rows_to_dicts(recent),
    }


def generate_response_recommendations(category: str, severity: str, district: str) -> List[str]:
    base_recs = {
        'water_pollution': [
            f"Deploy water quality testing team to {district} within 24 hours",
            "Issue community boil water advisory immediately",
            "Notify National Environment Management Authority (NEMA)",
            "Sample water source for laboratory analysis",
        ],
        'illegal_dumping': [
            f"Dispatch enforcement officers to {district} for investigation",
            "Document evidence and issue environmental citation",
            "Coordinate with local council for waste removal",
        ],
        'sewage_leak': [
            f"Contact {district} municipal sewage department urgently",
            "Deploy sanitation team for containment",
            "Post health warning signs in affected area",
            "Notify health surveillance unit for disease monitoring",
        ],
        'flooding': [
            f"Activate emergency flood response in {district}",
            f"Coordinate with Office of Prime Minister - Disaster Preparedness",
            "Deploy water pumps and sandbags",
            "Prepare evacuation shelters if water level rises",
        ],
        'environmental_hazard': [
            f"Deploy hazard assessment team to {district}",
            "Secure and cordon off affected area",
            "Notify national environmental protection agency",
        ],
        'infrastructure_damage': [
            f"Send structural engineer to assess damage in {district}",
            "Arrange emergency repairs if water access is compromised",
            "Document damage for insurance and budget allocation",
        ],
        'water_contamination': [
            f"EMERGENCY: Close water source in {district} immediately",
            f"Deploy alternative water supply to affected community in {district}",
            "Issue public health alert through all channels",
            "Send water treatment chemicals and testing kits",
        ],
    }

    recs = base_recs.get(category, [f"Investigate reported {category} in {district} and assign appropriate response team"])

    if severity in ('emergency', 'critical'):
        recs.insert(0, f"[EMERGENCY PROTOCOL] Activate national rapid response mechanism for {district}")
    elif severity == 'high':
        recs.insert(0, f"[HIGH PRIORITY] Accelerated response required for {district}")

    return recs[:5]
