"""
Dynamic Environmental Risk Scoring Module
Real-time risk assessment, heatmap generation, and predictive risk analysis.
"""

import sqlite3
import os
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any

DB_PATH = os.getenv("DB_PATH", "../server/watermonitor.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def compute_environmental_risk_index(district: str = None) -> Dict[str, Any]:
    conn = get_db()
    district_filter = " WHERE district = ? " if district else ""
    district_param = (district,) if district else ()

    water_quality_risk = _compute_water_quality_risk(conn, district_filter, district_param)
    infrastructure_risk = _compute_infrastructure_risk(conn, district_filter, district_param)
    climate_risk = _compute_climate_risk(conn, district_filter, district_param)
    health_risk = _compute_health_risk(conn, district_filter, district_param)
    community_risk = _compute_community_risk(conn, district_filter, district_param)

    conn.close()

    overall = round(
        water_quality_risk * 0.25
        + infrastructure_risk * 0.25
        + climate_risk * 0.20
        + health_risk * 0.15
        + community_risk * 0.15,
        1,
    )

    return {
        "overall_risk_score": overall,
        "risk_level": _risk_level(overall),
        "components": {
            "water_quality_risk": water_quality_risk,
            "infrastructure_risk": infrastructure_risk,
            "climate_risk": climate_risk,
            "health_risk": health_risk,
            "community_risk": community_risk,
        },
        "district": district or "all_districts",
        "generated_at": datetime.now().isoformat(),
    }


def _compute_water_quality_risk(conn, district_filter, district_param) -> float:
    row = conn.execute(
        f"""SELECT AVG(100 - overall_safe) as risk
            FROM water_quality_tests wqt
            JOIN water_points wp ON wqt.water_point_id = wp.id
            {district_filter}
            AND wqt.tested_at > datetime('now', '-90 days')""",
        district_param,
    ).fetchone()
    return round(row[0], 1) if row and row[0] else 20.0


def _compute_infrastructure_risk(conn, district_filter, district_param) -> float:
    row = conn.execute(
        f"""SELECT
            AVG(CASE WHEN wp.status != 'functional' THEN 100 ELSE 0 END) as status_risk,
            AVG(100 - wp.infrastructure_score) as score_risk
            FROM water_points wp {district_filter}""",
        district_param,
    ).fetchone()
    if row and row[0] is not None:
        return round((row[0] * 0.6 + row[1] * 0.4), 1)
    return 20.0


def _compute_climate_risk(conn, district_filter, district_param) -> float:
    drought = conn.execute(
        f"""SELECT AVG(
            CASE WHEN severity = 'extreme' THEN 100
                 WHEN severity = 'severe' THEN 75
                 WHEN severity = 'moderate' THEN 50
                 WHEN severity = 'mild' THEN 25
                 ELSE 0 END
        ) as risk FROM drought_index di {district_filter}""",
        district_param,
    ).fetchone()
    flood = conn.execute(
        f"""SELECT COUNT(*) as c FROM flood_alerts fa
            WHERE fa.is_active = 1 {district_filter.replace('WHERE', 'AND') if district_filter else ''}""",
        district_param if district else (),
    ).fetchone()
    temp = conn.execute(
        f"""SELECT AVG(temperature_max) as avg_temp
            FROM climate_readings cr
            {district_filter}
            AND timestamp > datetime('now', '-30 days')""",
        district_param,
    ).fetchone()
    drought_risk = drought[0] if drought and drought[0] else 20
    flood_risk = min(flood[0] * 20 if flood and flood[0] else 0, 100)
    temp_risk = min(max(((temp[0] or 26) - 25) * 5, 0), 100) if temp else 20
    return round(drought_risk * 0.4 + flood_risk * 0.35 + temp_risk * 0.25, 1)


def _compute_health_risk(conn, district_filter, district_param) -> float:
    recent_cases = conn.execute(
        f"""SELECT SUM(cases) as total FROM health_incidents hi
            WHERE reported_date > datetime('now', '-30 days')
            {district_filter.replace('WHERE', 'AND') if district_filter else ''}""",
        district_param if district else (),
    ).fetchone()
    outbreak = conn.execute(
        f"""SELECT COUNT(*) as c FROM health_incidents hi
            WHERE outbreak_status = 'active'
            {district_filter.replace('WHERE', 'AND') if district_filter else ''}""",
        district_param if district else (),
    ).fetchone()
    cases = recent_cases[0] if recent_cases and recent_cases[0] else 0
    outbreaks = outbreak[0] if outbreak and outbreak[0] else 0
    case_risk = min(cases * 2, 60)
    outbreak_risk = min(outbreaks * 20, 100)
    return round(case_risk + (outbreak_risk * 0.4), 1)


def _compute_community_risk(conn, district_filter, district_param) -> float:
    pending = conn.execute(
        f"""SELECT COUNT(*) as c FROM community_reports cr
            WHERE cr.status IN ('pending', 'acknowledged')
            {district_filter.replace('WHERE', 'AND') if district_filter else ''}""",
        district_param if district else (),
    ).fetchone()
    return min((pending[0] or 0) * 5, 100)


def calculate_water_security_score(district: str = None) -> Dict[str, Any]:
    conn = get_db()
    district_filter = " WHERE district = ? " if district else ""
    district_param = (district,) if district else ()

    wp_stats = conn.execute(
        f"""SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'functional' THEN 1 ELSE 0 END) as functional,
            AVG(infrastructure_score) as avg_score,
            SUM(beneficiaries) as total_beneficiaries
            FROM water_points wp {district_filter}""",
        district_param,
    ).fetchone()
    conn.close()
    if not wp_stats or wp_stats[0] == 0:
        return {"water_security_score": 0, "level": "insufficient_data"}

    total, functional, avg_score, beneficiaries = wp_stats
    functionality_rate = (functional / total) * 100 if total > 0 else 0
    score = round(functionality_rate * 0.5 + (avg_score or 80) * 0.5, 1)
    return {
        "water_security_score": score,
        "functionality_rate": round(functionality_rate, 1),
        "avg_infrastructure_score": round(avg_score, 1) if avg_score else 0,
        "total_water_points": total,
        "functional_count": functional,
        "total_beneficiaries": beneficiaries or 0,
        "level": "excellent" if score >= 80 else "good" if score >= 60 else "fair" if score >= 40 else "poor",
        "district": district or "all_districts",
    }


def compute_live_risk_summary() -> Dict[str, Any]:
    conn = get_db()
    critical_alerts = conn.execute(
        "SELECT COUNT(*) as c FROM alerts WHERE status = 'active' AND severity = 'critical'"
    ).fetchone()
    high_risk_wp = conn.execute(
        "SELECT COUNT(*) as c FROM water_points WHERE infrastructure_score < 40"
    ).fetchone()
    contamination_alerts = conn.execute(
        "SELECT COUNT(*) as c FROM water_quality_tests WHERE overall_safe < 50 AND tested_at > datetime('now', '-30 days')"
    ).fetchone()
    drought_districts = conn.execute(
        "SELECT COUNT(*) as c FROM drought_index WHERE severity IN ('severe','extreme')"
    ).fetchone()
    active_health = conn.execute(
        "SELECT COUNT(*) as c FROM health_incidents WHERE outbreak_status = 'active'"
    ).fetchone()
    pending_reports = conn.execute(
        "SELECT COUNT(*) as c FROM community_reports WHERE status = 'pending'"
    ).fetchone()
    conn.close()

    return {
        "critical_alerts": critical_alerts[0] if critical_alerts else 0,
        "high_risk_water_points": high_risk_wp[0] if high_risk_wp else 0,
        "contamination_events_30d": contamination_alerts[0] if contamination_alerts else 0,
        "drought_affected_districts": drought_districts[0] if drought_districts else 0,
        "active_outbreaks": active_health[0] if active_health else 0,
        "pending_citizen_reports": pending_reports[0] if pending_reports else 0,
        "overall_alert_level": _overall_alert_level(
            critical_alerts[0] if critical_alerts else 0,
            high_risk_wp[0] if high_risk_wp else 0,
            active_health[0] if active_health else 0,
        ),
        "generated_at": datetime.now().isoformat(),
    }


def _overall_alert_level(critical, high_risk_wp, active_outbreaks) -> str:
    score = critical * 10 + high_risk_wp * 5 + active_outbreaks * 15
    if score >= 50:
        return "critical"
    if score >= 20:
        return "high"
    if score >= 10:
        return "elevated"
    return "normal"


def _risk_level(score: float) -> str:
    if score >= 75:
        return "critical"
    if score >= 50:
        return "high"
    if score >= 25:
        return "medium"
    return "low"


def compute_all_district_risk_summary() -> List[Dict]:
    conn = get_db()
    districts = conn.execute(
        "SELECT DISTINCT district FROM water_points ORDER BY district"
    ).fetchall()
    conn.close()

    summaries = []
    for d in districts:
        district_name = d[0]
        risk = compute_environmental_risk_index(district_name)
        security = calculate_water_security_score(district_name)
        summaries.append({
            "district": district_name,
            "overall_risk": risk["overall_risk_score"],
            "risk_level": risk["risk_level"],
            "water_security_score": security["water_security_score"],
            "security_level": security["level"],
            "components": risk["components"],
        })
    return sorted(summaries, key=lambda x: x["overall_risk"], reverse=True)
