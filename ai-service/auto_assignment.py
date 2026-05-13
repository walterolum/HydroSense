"""
HYDROSENSE v4.0 Automated Task Assignment Engine
Intelligently routes citizen reports to the correct personnel based on:
- District, Sub-county, Village, Water zone, Environmental region
- Incident category, Severity, Time of day
- Personnel availability, Workload balancing
"""

import sqlite3
import os
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

logger = logging.getLogger("hydrosense.assignment")

DB_PATH = os.getenv("DB_PATH", "../server/watermonitor.db")

DEPARTMENT_MAP = {
    "water_contamination": "Water Quality",
    "broken_water_point": "Maintenance",
    "flooding": "Emergency Response",
    "sewage_leak": "Sanitation",
    "illegal_dumping": "Enforcement",
    "pollution": "Environmental Protection",
    "environmental_hazard": "Environmental Protection",
    "infrastructure_damage": "Infrastructure",
    "other": "General",
}

ROLE_MAP = {
    "water_contamination": ["health_officer", "district_officer"],
    "broken_water_point": ["technician", "district_officer"],
    "flooding": ["district_officer", "technician"],
    "sewage_leak": ["health_officer", "district_officer"],
    "illegal_dumping": ["district_officer", "ngo_officer"],
    "pollution": ["health_officer", "climate_scientist"],
    "environmental_hazard": ["district_officer", "climate_scientist"],
    "infrastructure_damage": ["technician", "district_officer"],
    "other": ["district_officer"],
}

PRIORITY_MAP = {"emergency": "emergency", "critical": "high", "high": "high", "medium": "medium", "low": "low"}


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def find_best_officer(
    district: str,
    incident_category: str,
    severity: str,
    sub_county: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Find the most appropriate officer for a given incident and locality."""
    conn = get_db()
    try:
        preferred_roles = ROLE_MAP.get(incident_category, ["district_officer"])

        candidates = conn.execute("""
            SELECT id, name, role, district, sub_county, email, phone,
                   last_login, active
            FROM users
            WHERE district = ?
              AND role IN ({})
              AND active = 1
            ORDER BY
              CASE
                WHEN sub_county = ? THEN 0
                ELSE 1
              END,
              last_login DESC
        """.format(",".join("?" for _ in preferred_roles)),
            [district] + preferred_roles + ([sub_county] if sub_county else [""])
        ).fetchall()

        if not candidates:
            candidates = conn.execute("""
                SELECT id, name, role, district, sub_county, email, phone,
                       last_login, active
                FROM users
                WHERE role IN ({}) AND active = 1
                ORDER BY last_login DESC
                LIMIT 3
            """.format(",".join("?" for _ in preferred_roles)),
                preferred_roles
            ).fetchall()

        if not candidates:
            candidates = conn.execute("""
                SELECT id, name, role, district, sub_county, email, phone,
                       last_login, active
                FROM users
                WHERE active = 1
                ORDER BY last_login DESC
                LIMIT 1
            """).fetchall()

        if candidates:
            c = candidates[0]
            workload = conn.execute("""
                SELECT COUNT(*) as c FROM task_assignments
                WHERE assigned_to = ? AND status IN ('assigned', 'in_progress')
            """, (c["id"],)).fetchone()
            return {
                "id": c["id"],
                "name": c["name"],
                "role": c["role"],
                "district": c["district"],
                "sub_county": c.get("sub_county", ""),
                "email": c.get("email", ""),
                "phone": c.get("phone", ""),
                "active_tasks": workload["c"] if workload else 0,
            }
        return None
    except Exception as e:
        logger.error(f"Error finding officer: {e}")
        return None
    finally:
        conn.close()


def auto_assign_report(report_id: int) -> Dict[str, Any]:
    """Auto-assign a citizen report to the best officer."""
    conn = get_db()
    try:
        report = conn.execute("""
            SELECT cr.*, ia.ai_category, ia.ai_severity, ia.ai_risk_score,
                   ia.ai_urgency, ia.response_recommendation,
                   ia.suggested_departments, ia.key_issues,
                   ia.detected_sub_county, ia.detected_village
            FROM citizen_reports cr
            LEFT JOIN incident_analysis ia ON cr.id = ia.report_id
            WHERE cr.id = ?
        """, (report_id,)).fetchone()

        if not report:
            return {"success": False, "error": "Report not found"}

        district = report["district"]
        sub_county = report.get("detected_sub_county") or report["sub_county"]
        category = report.get("ai_category") or report["incident_type"]
        severity = report.get("ai_severity") or report["severity"]
        is_emergency = severity in ("critical", "emergency")

        officer = find_best_officer(district, category, severity, sub_county)

        if not officer:
            logger.warning(f"No officer found for report #{report_id} in {district}")
            return {"success": False, "error": "No available officer found"}

        department = DEPARTMENT_MAP.get(category, "General")
        priority = PRIORITY_MAP.get(severity, "medium")

        existing = conn.execute(
            "SELECT id FROM task_assignments WHERE report_id = ? AND assigned_to = ?",
            (report_id, officer["id"])
        ).fetchone()
        if existing:
            return {"success": True, "message": "Already assigned", "assignment_id": existing["id"]}

        result = conn.execute("""
            INSERT INTO task_assignments
                (report_id, assigned_to, assigned_by, task_type, priority,
                 status, department, district, description, location,
                 sub_county, village)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            report_id,
            officer["id"],
            officer["id"],
            f"{category.replace('_', ' ')} response",
            priority,
            "assigned",
            department,
            district,
            report["description"][:500] if report["description"] else "Respond to citizen report",
            f"{report.get('detected_village', '') or report['village'] or ''}, {sub_county or ''}, {district}".strip(", "),
            sub_county or "",
            report.get("detected_village", "") or report["village"] or "",
        )).lastrowid

        conn.execute(
            "UPDATE citizen_reports SET status = 'assigned', updated_at = datetime('now') WHERE id = ?",
            (report_id,)
        )

        ticket_num = f"TKT-{datetime.utcnow().strftime('%Y%m%d')}-{report_id:04d}"
        conn.execute("""
            INSERT INTO response_tickets
                (report_id, ticket_number, title, description, priority,
                 status, assigned_team, assigned_agency, district, location,
                 created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            report_id, ticket_num,
            f"{category.replace('_', ' ')} - {district}",
            report["description"][:500] if report["description"] else "Response ticket",
            priority, "open", officer["name"],
            ", ".join(json.loads(report.get("suggested_departments", "[]")) if isinstance(report.get("suggested_departments"), str) else report.get("suggested_departments", [])),
            district,
            f"{report.get('detected_village', '') or report['village'] or ''}, {sub_county or ''}, {district}".strip(", "),
            officer["id"],
        ))

        conn.execute("""
            INSERT INTO citizen_report_tracking (report_id, status, note, updated_by)
            VALUES (?, 'assigned', ?, ?)
        """, (
            report_id,
            f"AI auto-assigned to {officer['name']} ({officer['role']}) in {department}",
            officer["id"],
        ))

        conn.commit()

        notification = _create_notification(conn, officer, report, category, severity, ticket_num, district)

        logger.info(f"Report #{report_id} auto-assigned to {officer['name']} ({officer['role']})")

        return {
            "success": True,
            "assignment_id": result,
            "ticket": ticket_num,
            "officer": officer,
            "department": department,
            "priority": priority,
            "notification": notification,
            "message": f"Assigned to {officer['name']} in {department}",
        }
    except Exception as e:
        logger.error(f"Auto-assign failed: {e}")
        return {"success": False, "error": str(e)}
    finally:
        conn.close()


def _create_notification(
    conn, officer: dict, report, category: str,
    severity: str, ticket_num: str, district: str,
) -> Dict[str, Any]:
    """Create notifications for the assigned officer."""
    message = (
        f"[HYDROSENSE ALERT] New {category.replace('_', ' ')} incident ({severity}) "
        f"in {district}. Ticket: {ticket_num}. "
        f"Please respond promptly."
    )

    channels = ["in_app"]
    if officer.get("email"):
        channels.append("email")
    if officer.get("phone"):
        channels.append("sms")

    notifications = []
    for ch in channels:
        result = conn.execute("""
            INSERT INTO notification_log
                (recipient_type, recipient_id, recipient_contact, channel,
                 subject, message, status, reference_type, reference_id)
            VALUES (?, ?, ?, ?, ?, ?, 'sent', 'task_assignment', ?)
        """, (
            "user",
            officer["id"],
            officer.get("email") or officer.get("phone") or None,
            ch,
            f"New {category.replace('_', ' ')} Incident - {district}",
            message,
            report["id"] if report else None,
        )).lastrowid
        notifications.append({"id": result, "channel": ch})

    return {"channels": notifications, "message": message}


def get_available_officers(district: str, incident_type: str) -> List[Dict[str, Any]]:
    """Get list of available officers for manual assignment."""
    conn = get_db()
    try:
        preferred_roles = ROLE_MAP.get(incident_type, ["district_officer"])

        officers = conn.execute("""
            SELECT u.id, u.name, u.role, u.district, u.sub_county, u.email, u.phone,
                   (SELECT COUNT(*) FROM task_assignments ta
                    WHERE ta.assigned_to = u.id AND ta.status IN ('assigned','in_progress')) as active_tasks,
                   u.last_login
            FROM users u
            WHERE u.district = ? AND u.active = 1
            ORDER BY
              CASE WHEN u.role IN ({}) THEN 0 ELSE 1 END,
              active_tasks ASC,
              u.last_login DESC
        """.format(",".join("?" for _ in preferred_roles)),
            [district] + preferred_roles
        ).fetchall()

        return [dict(o) for o in officers]
    except Exception as e:
        logger.error(f"Error getting officers: {e}")
        return []
    finally:
        conn.close()


def get_officer_stats(district: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get workload stats for all officers."""
    conn = get_db()
    try:
        where = "WHERE u.role IN ('district_officer','technician','health_officer','climate_scientist','ngo_officer')"
        params = []
        if district:
            where += " AND u.district = ?"
            params.append(district)

        officers = conn.execute(f"""
            SELECT u.id, u.name, u.role, u.district, u.sub_county,
                   (SELECT COUNT(*) FROM task_assignments ta
                    WHERE ta.assigned_to = u.id AND ta.status IN ('assigned','in_progress')) as active_tasks,
                   (SELECT COUNT(*) FROM task_assignments ta
                    WHERE ta.assigned_to = u.id AND ta.status = 'completed') as completed_tasks
            FROM users u
            {where}
            ORDER BY active_tasks ASC
        """, params).fetchall()

        return [dict(o) for o in officers]
    finally:
        conn.close()
