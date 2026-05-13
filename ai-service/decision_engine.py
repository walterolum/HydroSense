"""
AI Decision Support Engine
Intelligent incident prioritization, response recommendations, task assignment, and escalation.
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


def prioritize_incidents(limit: int = 20) -> List[Dict]:
    conn = get_db()
    rows = conn.execute(
        """SELECT cr.*,
           COALESCE(ia.ai_risk_score, 0) as ai_risk_score,
           COALESCE(ia.ai_severity, cr.severity) as ai_severity,
           COALESCE(ia.ai_category, 'uncategorized') as ai_category,
           COALESCE(ia.confidence_score, 0) as confidence_score,
           COALESCE(ia.is_duplicate, 0) as is_duplicate,
           COALESCE(ia.response_recommendation, '') as response_recommendation
        FROM citizen_reports cr
        LEFT JOIN incident_analysis ia ON cr.id = ia.report_id
        WHERE cr.status IN ('pending', 'acknowledged', 'in_progress')
        ORDER BY
          CASE WHEN cr.severity = 'critical' THEN 0
               WHEN cr.severity = 'high' THEN 1
               WHEN cr.severity = 'medium' THEN 2
               ELSE 3 END,
          ia.ai_risk_score DESC,
          cr.created_at ASC
        LIMIT ?""",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def recommend_response_strategy(
    incident_type: str,
    severity: str,
    district: str,
    affected_population: int = 0,
) -> Dict[str, Any]:
    strategies = {
        "water_pollution": {
            "critical": {
                "timeline": "Within 2 hours",
                "actions": [
                    "Issue immediate public health advisory",
                    "Deploy water quality testing team",
                    "Dispatch emergency chlorination supplies",
                    "Notify Ministry of Water and NEMA",
                    "Establish water distribution point",
                ],
                "departments": ["health_officer", "district_engineer", "environmental_agency"],
                "resources": ["testing_kits", "chlorine_tablets", "water_tanks"],
            },
            "high": {
                "timeline": "Within 6 hours",
                "actions": [
                    "Issue boil water advisory",
                    "Schedule water quality test within 24h",
                    "Inspect upstream pollution sources",
                ],
                "departments": ["health_officer", "district_engineer"],
                "resources": ["testing_kits"],
            },
            "medium": {
                "timeline": "Within 24 hours",
                "actions": [
                    "Schedule water quality test",
                    "Monitor and report",
                ],
                "departments": ["health_officer"],
                "resources": ["testing_kits"],
            },
        },
        "infrastructure_failure": {
            "critical": {
                "timeline": "Within 1 hour",
                "actions": [
                    "Dispatch emergency repair team",
                    "Arrange alternative water supply",
                    "Cordon off hazardous area",
                    "Notify district engineer and local authority",
                ],
                "departments": ["technician", "district_engineer", "community_officer"],
                "resources": ["repair_kit", "water_tanks", "truck"],
            },
            "high": {
                "timeline": "Within 4 hours",
                "actions": [
                    "Schedule repair within 24h",
                    "Inform community of expected downtime",
                    "Arrange temporary water supply if needed",
                ],
                "departments": ["technician", "district_engineer"],
                "resources": ["repair_kit"],
            },
            "medium": {
                "timeline": "Within 48 hours",
                "actions": [
                    "Log for scheduled maintenance",
                    "Assess if repair or replacement needed",
                ],
                "departments": ["technician"],
                "resources": [],
            },
        },
        "drought": {
            "critical": {
                "timeline": "Immediate",
                "actions": [
                    "Activate emergency drought response plan",
                    "Coordinate water trucking operations",
                    "Identify alternative water sources",
                    "Ration remaining water supplies",
                    "Appeal for emergency funding",
                ],
                "departments": ["district_manager", "community_officer", "ngp_officer"],
                "resources": ["water_tanks", "truck", "funding"],
            },
            "high": {
                "timeline": "Within 12 hours",
                "actions": [
                    "Monitor water levels daily",
                    "Prepare contingency plan",
                    "Identify at-risk communities",
                ],
                "departments": ["climate_scientist", "district_manager"],
                "resources": ["monitoring_equipment"],
            },
        },
        "flooding": {
            "critical": {
                "timeline": "Immediate",
                "actions": [
                    "Activate flood emergency protocol",
                    "Coordinate evacuations if needed",
                    "Deploy rescue teams",
                    "Set up emergency shelters",
                    "Test water sources for contamination",
                ],
                "departments": ["emergency_response", "health_officer", "district_manager"],
                "resources": ["rescue_equipment", "water_tanks", "medical_supplies"],
            },
        },
        "health_outbreak": {
            "critical": {
                "timeline": "Immediate",
                "actions": [
                    "Notify Ministry of Health",
                    "Deploy medical response team",
                    "Test all linked water sources",
                    "Distribute water treatment supplies",
                    "Community health education campaign",
                ],
                "departments": ["health_officer", "district_manager", "community_officer"],
                "resources": ["medical_supplies", "testing_kits", "chlorine_tablets"],
            },
        },
    }

    type_strategy = strategies.get(
        incident_type, strategies.get("water_pollution", {})
    )
    severity_strategy = type_strategy.get(
        severity, type_strategy.get("medium", {})
    )

    return {
        "incident_type": incident_type,
        "severity": severity,
        "district": district,
        "response_timeline": severity_strategy.get("timeline", "Within 72 hours"),
        "recommended_actions": severity_strategy.get("actions", ["Review and assess"]),
        "responsible_departments": severity_strategy.get("departments", ["community_officer"]),
        "required_resources": severity_strategy.get("resources", []),
        "affected_population": affected_population,
        "generated_at": datetime.now().isoformat(),
    }


def auto_assign_task(
    incident: Dict,
    available_technicians: List[Dict] = None,
) -> Dict[str, Any]:
    conn = get_db()
    if not available_technicians:
        role_map = {
            "water_pollution": "health_officer",
            "infrastructure_failure": "technician",
            "drought": "district_officer",
            "flooding": "district_officer",
            "health_outbreak": "health_officer",
            "illegal_dumping": "national_admin",
        }
        target_role = role_map.get(
            incident.get("incident_type", ""), "technician"
        )
        available = conn.execute(
            """SELECT id, name, role, district FROM users
               WHERE role = ? AND active = 1
               ORDER BY last_login DESC LIMIT 5""",
            (target_role,),
        ).fetchall()
        available_technicians = [dict(a) for a in available]

    if not available_technicians:
        available = conn.execute(
            """SELECT id, name, role, district FROM users
               WHERE active = 1 ORDER BY last_login DESC LIMIT 3"""
        ).fetchall()
        available_technicians = [dict(a) for a in available]

    conn.close()

    severity_levels = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    priority_map = {0: "critical", 1: "high", 2: "medium", 3: "low"}
    incident_severity = severity_levels.get(incident.get("severity", "medium"), 2)
    hours_map = {0: 2, 1: 12, 2: 24, 3: 72}

    assignee = available_technicians[0] if available_technicians else None

    return {
        "assigned_to": assignee,
        "priority": priority_map.get(incident_severity, "medium"),
        "due_by": (datetime.now() + timedelta(hours=hours_map.get(incident_severity, 72))).isoformat(),
        "task_type": "incident_response",
        "department": assignee.get("role", "technician") if assignee else "unassigned",
        "district": incident.get("district", ""),
        "escalation_level": "immediate" if incident_severity <= 1 else "standard",
    }


def escalate_if_needed(incident: Dict) -> Dict[str, Any]:
    severity = incident.get("severity", "medium")
    ai_risk = incident.get("ai_risk_score", 0)
    affected = incident.get("affected_population", 0)

    auto_escalate = False
    escalation_level = "none"
    escalation_reasons = []
    notify_roles = []

    if severity == "critical" and affected >= 1000:
        auto_escalate = True
        escalation_level = "national"
        escalation_reasons.append("Critical incident affecting 1000+ people")
        notify_roles = ["national_admin", "district_manager", "health_officer"]
    elif severity == "critical":
        auto_escalate = True
        escalation_level = "regional"
        escalation_reasons.append("Critical severity incident")
        notify_roles = ["district_manager", "health_officer"]
    elif severity == "high" and ai_risk >= 80:
        auto_escalate = True
        escalation_level = "regional"
        escalation_reasons.append("High severity with elevated AI risk score")
        notify_roles = ["district_manager"]
    elif ai_risk >= 90:
        auto_escalate = True
        escalation_level = "national"
        escalation_reasons.append("AI risk score exceeds 90 threshold")
        notify_roles = ["national_admin", "district_manager"]

    return {
        "should_escalate": auto_escalate,
        "escalation_level": escalation_level,
        "reasons": escalation_reasons,
        "notify_roles": notify_roles,
        "recommended_action": "Immediate notification and response coordination"
        if auto_escalate
        else "Continue standard response protocol",
    }


def generate_operational_insights(district: str = None) -> Dict[str, Any]:
    conn = get_db()
    district_filter = " WHERE wp.district = ? " if district else ""
    district_param = (district,) if district else ()

    total_wp = conn.execute(
        f"SELECT COUNT(*) as c FROM water_points wp {district_filter}",
        district_param,
    ).fetchone()

    non_func = conn.execute(
        f"SELECT COUNT(*) as c FROM water_points wp WHERE wp.status != 'functional' {district_filter.replace('WHERE', 'AND') if district_filter else ''}",
        district_param if district else (),
    ).fetchone()

    active_alerts = conn.execute(
        f"SELECT COUNT(*) as c FROM alerts a WHERE a.status = 'active' {district_filter.replace('WHERE wp.district', 'AND a.district') if district_filter else ''}",
        district_param if district else (),
    ).fetchone()

    pending_maintenance = conn.execute(
        "SELECT COUNT(*) as c FROM maintenance_requests WHERE status IN ('open','in_progress')"
    ).fetchone()

    recent_reports = conn.execute(
        f"SELECT COUNT(*) as c FROM community_reports cr WHERE cr.created_at > datetime('now', '-7 days') {district_filter.replace('WHERE', 'AND') if district_filter else ''}",
        district_param if district else (),
    ).fetchone()

    health_incidents = conn.execute(
        "SELECT COUNT(*) as c FROM health_incidents WHERE reported_date > datetime('now', '-30 days')"
    ).fetchone()

    conn.close()

    return {
        "total_water_points": total_wp[0] if total_wp else 0,
        "non_functional_count": non_func[0] if non_func else 0,
        "functionality_rate": round(
            ((total_wp[0] - non_func[0]) / total_wp[0] * 100) if total_wp and total_wp[0] > 0 else 0, 1
        ),
        "active_alerts": active_alerts[0] if active_alerts else 0,
        "pending_maintenance": pending_maintenance[0] if pending_maintenance else 0,
        "reports_last_7_days": recent_reports[0] if recent_reports else 0,
        "health_incidents_30_days": health_incidents[0] if health_incidents else 0,
        "generated_at": datetime.now().isoformat(),
    }


def generate_risk_heatmap_data(district: str = None) -> List[Dict]:
    conn = get_db()
    if district:
        rows = conn.execute(
            """SELECT wp.district, wp.id as water_point_id, wp.name, wp.lat, wp.lng,
               wp.status, wp.infrastructure_score,
               (SELECT COUNT(*) FROM alerts WHERE water_point_id = wp.id AND status = 'active') as alert_count,
               (SELECT COUNT(*) FROM community_reports WHERE district = wp.district AND created_at > datetime('now', '-30 days')) as recent_reports,
               (SELECT AVG(overall_safe) FROM water_quality_tests WHERE water_point_id = wp.id) as avg_quality
               FROM water_points wp WHERE wp.district = ?""",
            (district,),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT wp.district, COUNT(*) as water_points,
               SUM(CASE WHEN wp.status != 'functional' THEN 1 ELSE 0 END) as non_functional,
               AVG(wp.infrastructure_score) as avg_infra_score,
               (SELECT COUNT(*) FROM alerts WHERE district = wp.district AND status = 'active') as alert_count,
               (SELECT COUNT(*) FROM community_reports WHERE district = wp.district AND created_at > datetime('now', '-30 days')) as recent_reports
               FROM water_points wp GROUP BY wp.district"""
        ).fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        risk_score = (
            (100 - (d.get("avg_infra_score", d.get("infrastructure_score", 80)) or 80))
            * 0.4
            + (d.get("non_functional", 0) * 5 if district else d.get("non_functional", 0) / max(d.get("water_points", 1), 1) * 40)
            + d.get("alert_count", 0) * 5
            + min(d.get("recent_reports", 0), 20)
        )
        risk_score = min(max(risk_score, 0), 100)
        d["risk_score"] = round(risk_score, 1)
        d["risk_level"] = (
            "critical" if risk_score >= 75
            else "high" if risk_score >= 50
            else "medium" if risk_score >= 25
            else "low"
        )
        results.append(d)
    return results


def get_multi_agency_coordination(incident_id: int = None) -> List[Dict]:
    conn = get_db()
    if incident_id:
        rows = conn.execute(
            "SELECT * FROM agency_assignments WHERE incident_id = ?", (incident_id,)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT aa.*, ei.title as incident_title, ei.severity as incident_severity,
               ei.district as incident_district
               FROM agency_assignments aa
               JOIN env_incidents ei ON aa.incident_id = ei.id
               WHERE aa.status = 'active'"""
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
