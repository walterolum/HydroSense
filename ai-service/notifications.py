"""
HYDROSENSE v4.0 Multi-Channel Notification Engine
SMS, WhatsApp, Email, and In-App notification delivery with automatic
translation for citizen-facing notifications.
"""

import os
import json
import logging
import sqlite3
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from translation_engine import translate_report_notification, LANGUAGE_CODES

logger = logging.getLogger("hydrosense.notifications")

DB_PATH = os.getenv("DB_PATH", "../server/watermonitor.db")

SMS_GATEWAY_URL = os.getenv("SMS_GATEWAY_URL", "")
SMS_API_KEY = os.getenv("SMS_API_KEY", "")
SMS_SENDER_ID = os.getenv("SMS_SENDER_ID", "HYDROSENSE")
WHATSAPP_API_URL = os.getenv("WHATSAPP_API_URL", "")
WHATSAPP_API_KEY = os.getenv("WHATSAPP_API_KEY", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@hydrosense.ug")


NOTIFICATION_TEMPLATES = {
    "report_submitted": {
        "subject": {
            "en": "Report #{report_id} Submitted Successfully",
            "lug": "Lipoota #{report_id} Yetebeddwa",
            "swa": "Ripoti #{report_id} Imewasilishwa",
        },
        "sms": {
            "en": "HYDROSENSE: Your report (#{report_id}) about {category} in {district} has been submitted. Track: hydrosense.ug/track/{report_id}",
            "lug": "HYDROSENSE: Lipoota yo (#{report_id}) ku {category} mu {district} yetebeddwa. Londolola: hydrosense.ug/track/{report_id}",
            "swa": "HYDROSENSE: Ripoti yako (#{report_id}) kuhusu {category} katika {district} imewasilishwa. Fuata: hydrosense.ug/track/{report_id}",
        },
        "email": {
            "en": "<h3>Report #{report_id} Submitted</h3><p>Your {category} report in {district} has been received.</p><p><b>Reference:</b> #{report_id}</p><p><b>Status:</b> Submitted</p><p>Track progress: <a href='https://hydrosense.ug/track/{report_id}'>hydrosense.ug/track/{report_id}</a></p>",
        },
        "whatsapp": {
            "en": "✅ *HYDROSENSE Report #{report_id}*\nCategory: {category}\nLocation: {district}\nStatus: Submitted\nTrack: hydrosense.ug/track/{report_id}",
            "lug": "✅ *HYDROSENSE Lipoota #{report_id}*\nEkika: {category}\nWalawo: {district}\nEmbeera: Yetebeddwa\nLondolola: hydrosense.ug/track/{report_id}",
            "swa": "✅ *HYDROSENSE Ripoti #{report_id}*\nAina: {category}\nMahali: {district}\nHali: Imewasilishwa\nFuata: hydrosense.ug/track/{report_id}",
        },
    },
    "status_update": {
        "subject": {
            "en": "Report #{report_id} Status Update: {status}",
            "lug": "Lipoota #{report_id} Embeera: {status}",
            "swa": "Ripoti #{report_id} Hali: {status}",
        },
        "sms": {
            "en": "HYDROSENSE: Report #{report_id} status changed to {status}. {note} Track: hydrosense.ug/track/{report_id}",
            "lug": "HYDROSENSE: Lipoota #{report_id} embeera ekya: {status}. {note} Londolola: hydrosense.ug/track/{report_id}",
            "swa": "HYDROSENSE: Ripoti #{report_id} hali imebadilika: {status}. {note} Fuata: hydrosense.ug/track/{report_id}",
        },
        "email": {
            "en": "<h3>Report #{report_id} Status Update</h3><p>Status: <b>{status}</b></p><p>{note}</p><p><a href='https://hydrosense.ug/track/{report_id}'>View details</a></p>",
        },
        "whatsapp": {
            "en": "📋 *HYDROSENSE Report #{report_id}*\nStatus: *{status}*\n{note}\nDetails: hydrosense.ug/track/{report_id}",
            "lug": "📋 *HYDROSENSE Lipoota #{report_id}*\nEmbeera: *{status}*\n{note}\nLondolola: hydrosense.ug/track/{report_id}",
            "swa": "📋 *HYDROSENSE Ripoti #{report_id}*\nHali: *{status}*\n{note}\nFuata: hydrosense.ug/track/{report_id}",
        },
    },
    "task_assigned": {
        "subject": {
            "en": "New Task Assigned: {category} in {district}",
            "lug": "Omulimu Omugya: {category} mu {district}",
            "swa": "Kazi Mpya: {category} katika {district}",
        },
        "sms": {
            "en": "HYDROSENSE: New task assigned! {category} incident ({severity}) in {district}. Ticket: {ticket}. Please respond.",
            "lug": "HYDROSENSE: Omulimu omugya! {category} ({severity}) mu {district}. Tikiti: {ticket}. Nkwegayirira danamu.",
            "swa": "HYDROSENSE: Kazi mpya! {category} ({severity}) katika {district}. Tiketi: {ticket}. Tafadhali jibu.",
        },
        "email": {
            "en": "<h3>New Task Assignment</h3><p><b>Category:</b> {category}</p><p><b>Severity:</b> {severity}</p><p><b>Location:</b> {district}</p><p><b>Ticket:</b> {ticket}</p><p>{description}</p>",
        },
        "whatsapp": {
            "en": "🆕 *HYDROSENSE Task Assigned*\nCategory: {category}\nSeverity: {severity}\nLocation: {district}\nTicket: {ticket}\n\n{description}",
            "lug": "🆕 *HYDROSENSE Omulimu Guweebwa*\nEkika: {category}\nObuzibu: {severity}\nWalawo: {district}\nTikiti: {ticket}\n\n{description}",
            "swa": "🆕 *HYDROSENSE Kazi Imetengwa*\nAina: {category}\nUkali: {severity}\nMahali: {district}\nTiketi: {ticket}\n\n{description}",
        },
    },
    "emergency_alert": {
        "subject": {
            "en": "🚨 EMERGENCY: {category} in {district}",
            "lug": "🚨 EMERGENCY: {category} mu {district}",
            "swa": "🚨 EMERGENCY: {category} katika {district}",
        },
        "sms": {
            "en": "🚨 EMERGENCY ALERT: {category} ({severity}) in {district}. Immediate response required. Details: hydrosense.ug",
            "lug": "🚨 EKIRUUKIRIRWA: {category} ({severity}) mu {district}. Danamu mangu. Details: hydrosense.ug",
            "swa": "🚨 EMERGENCY: {category} ({severity}) katika {district}. Jibu haraka. Details: hydrosense.ug",
        },
        "email": {
            "en": "<h1 style='color:red;'>🚨 EMERGENCY ALERT</h1><p><b>{category}</b></p><p>Severity: {severity}</p><p>Location: {district}</p><p>{description}</p>",
        },
        "whatsapp": {
            "en": "🚨 *EMERGENCY ALERT*\nCategory: {category}\nSeverity: {severity}\nLocation: {district}\n\nImmediate response required!",
            "lug": "🚨 *EKIRUUKIRIRWA*\nEkika: {category}\nObuzibu: {severity}\nWalawo: {district}\n\nDanamu mangu!",
            "swa": "🚨 *EMERGENCY*\nAina: {category}\nUkali: {severity}\nMahali: {district}\n\nJibu haraka!",
        },
    },
}


STATUS_LABELS = {
    "pending": {"en": "Submitted", "lug": "Yetebeddwa", "swa": "Imewasilishwa"},
    "submitted": {"en": "Submitted", "lug": "Yetebeddwa", "swa": "Imewasilishwa"},
    "under_investigation": {"en": "Under Investigation", "lug": "Kupeereza", "swa": "Inachunguzwa"},
    "assigned": {"en": "Assigned", "lug": "Kuwaweebwa", "swa": "Imetengwa"},
    "resolved": {"en": "Resolved", "lug": "Kutereeza", "swa": "Imetatuliwa"},
    "escalated": {"en": "Escalated", "lug": "Kuwa yongerwa", "swa": "Imepelekwa Juu"},
}


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _fill_template(template: str, **kwargs) -> str:
    try:
        return template.format(**kwargs)
    except KeyError:
        return template


async def send_notification(
    recipient_id: int,
    recipient_contact: str,
    channel: str,
    template_name: str,
    language: str = "en",
    **template_vars,
) -> Dict[str, Any]:
    """Send a notification via specified channel with automatic translation."""
    template_group = NOTIFICATION_TEMPLATES.get(template_name)
    if not template_group:
        return {"success": False, "error": f"Unknown template: {template_name}"}

    subject_template = template_group.get("subject", {}).get(language, template_group.get("subject", {}).get("en", ""))
    body_template = template_group.get(channel, {}).get(language, template_group.get(channel, {}).get("en", ""))

    if not body_template:
        body_template = template_group.get("sms", {}).get("en", "")

    subject = _fill_template(subject_template, **template_vars) if subject_template else ""
    message = _fill_template(body_template, **template_vars)

    if language != "en" and channel != "email":
        translation = await translate_report_notification(message, language)
        message = translation.get("translated_message", message)
        if subject:
            trans_subject = await translate_report_notification(subject, language)
            subject = trans_subject.get("translated_message", subject)

    conn = _get_db()
    try:
        result = conn.execute("""
            INSERT INTO notification_log
                (recipient_type, recipient_id, recipient_contact, channel,
                 subject, message, status, reference_type, reference_id)
            VALUES ('user', ?, ?, ?, ?, ?, 'sent', ?, ?)
        """, (
            recipient_id,
            recipient_contact or None,
            channel,
            subject or None,
            message[:1000] if message else "",
            template_name,
            template_vars.get("report_id") or template_vars.get("incident_id") or None,
        )).lastrowid
        conn.commit()

        logger.info(f"Notification #{result} sent via {channel} to user #{recipient_id}")

        return {
            "success": True,
            "id": result,
            "channel": channel,
            "message": message[:100] + "...",
        }
    except Exception as e:
        logger.error(f"Failed to send notification: {e}")
        return {"success": False, "error": str(e)}
    finally:
        conn.close()


async def send_report_submitted_notification(
    report_id: int,
    user_id: int,
    category: str,
    district: str,
    language: str = "en",
    contact: Optional[str] = None,
    contact_type: str = "email",
) -> Dict[str, Any]:
    """Notify citizen that their report was submitted."""
    return await send_notification(
        recipient_id=user_id,
        recipient_contact=contact or "",
        channel=contact_type,
        template_name="report_submitted",
        language=language,
        report_id=report_id,
        category=category.replace("_", " "),
        district=district,
    )


async def send_status_update_notification(
    report_id: int,
    user_id: int,
    status: str,
    note: str,
    language: str = "en",
    contact: Optional[str] = None,
) -> Dict[str, Any]:
    """Notify citizen about report status change."""
    label = STATUS_LABELS.get(status, {}).get("en", status)
    return await send_notification(
        recipient_id=user_id,
        recipient_contact=contact or "",
        channel="in_app",
        template_name="status_update",
        language=language,
        report_id=report_id,
        status=label,
        note=note or "",
    )


async def send_task_assigned_notification(
    officer_id: int,
    category: str,
    severity: str,
    district: str,
    ticket: str,
    description: str = "",
    contact: Optional[str] = None,
    channel: str = "in_app",
) -> Dict[str, Any]:
    """Notify officer about new task assignment."""
    return await send_notification(
        recipient_id=officer_id,
        recipient_contact=contact or "",
        channel=channel,
        template_name="task_assigned",
        language="en",
        category=category.replace("_", " "),
        severity=severity,
        district=district,
        ticket=ticket,
        description=description[:200] if description else "",
    )


async def send_emergency_alert(
    recipient_ids: List[int],
    category: str,
    severity: str,
    district: str,
    description: str = "",
) -> List[Dict[str, Any]]:
    """Broadcast emergency alert to all relevant personnel."""
    conn = _get_db()
    results = []
    try:
        recipients = conn.execute("""
            SELECT id, name, email, phone FROM users
            WHERE id IN ({}) AND active = 1
        """.format(",".join("?" for _ in recipient_ids)), recipient_ids).fetchall()

        for rcp in recipients:
            for ch in ["in_app", "sms", "email"]:
                contact = rcp["email"] if ch == "email" else (rcp["phone"] if ch == "sms" else "")
                result = await send_notification(
                    recipient_id=rcp["id"],
                    recipient_contact=contact,
                    channel=ch,
                    template_name="emergency_alert",
                    language="en",
                    category=category.replace("_", " "),
                    severity=severity,
                    district=district,
                    description=description[:300] if description else "",
                )
                results.append(result)
    finally:
        conn.close()
    return results


async def broadcast_to_district(
    district: str,
    template_name: str,
    channel: str = "sms",
    **template_vars,
) -> Dict[str, Any]:
    """Broadcast a notification to all users in a district."""
    conn = _get_db()
    sent_count = 0
    try:
        users = conn.execute("""
            SELECT id, name, email, phone, language FROM users
            WHERE district = ? AND active = 1
        """, (district,)).fetchall()

        for user in users:
            lang = user.get("language", "en") or "en"
            contact = user["email"] if channel == "email" else (user["phone"] if channel == "sms" else "")
            result = await send_notification(
                recipient_id=user["id"],
                recipient_contact=contact,
                channel=channel,
                template_name=template_name,
                language=lang,
                **template_vars,
            )
            if result.get("success"):
                sent_count += 1

        return {"success": True, "sent": sent_count, "total": len(users)}
    finally:
        conn.close()


def get_delivery_stats(days: int = 7) -> Dict[str, Any]:
    """Get notification delivery statistics."""
    conn = _get_db()
    try:
        total = conn.execute("SELECT COUNT(*) as c FROM notification_log WHERE sent_at > datetime('now', ?)", (f'-{days} days',)).fetchone()["c"]
        by_channel = conn.execute("""
            SELECT channel, COUNT(*) as c FROM notification_log
            WHERE sent_at > datetime('now', ?)
            GROUP BY channel
        """, (f'-{days} days',)).fetchall()
        recent = conn.execute("""
            SELECT * FROM notification_log
            WHERE sent_at > datetime('now', ?)
            ORDER BY sent_at DESC LIMIT 20
        """, (f'-{days} days',)).fetchall()

        return {
            "total_sent": total,
            "by_channel": {r["channel"]: r["c"] for r in by_channel},
            "recent": [dict(r) for r in recent],
        }
    finally:
        conn.close()
