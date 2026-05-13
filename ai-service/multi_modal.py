"""
Multi-Modal AI Processing Module
Handles analysis of images, audio, documents, SMS, and other media types.
"""

import os
import json
import base64
import io
from typing import Optional, Dict, Any
from PIL import Image
import httpx

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"


async def analyze_image(
    image_data: str, image_mime: str, context: str = ""
) -> Dict[str, Any]:
    prompt = f"""Analyze this environmental/water infrastructure image in detail.
Context: {context}

Return a JSON object with:
- "description": detailed description of what is visible
- "issues": list of detected issues (e.g., water contamination, infrastructure damage, pollution)
- "severity": "low", "medium", "high", or "critical"
- "recommendation": suggested action
- "tags": array of relevant keywords
- "water_quality_indicators": any visible signs about water quality (color, clarity, algae, etc.)
- "infrastructure_condition": assessment of any visible infrastructure
"""
    return await _call_gemini_vision(prompt, image_data, image_mime)


async def analyze_document(text: str, doc_type: str = "report") -> Dict[str, Any]:
    prompt = f"""Analyze this environmental/water management {doc_type}.

Content:
{text[:8000]}

Return a JSON object with:
- "summary": 2-3 sentence summary
- "key_findings": array of key points
- "risks_identified": array of any environmental or water risks mentioned
- "recommended_actions": array of recommended actions
- "sentiment": "positive", "neutral", or "negative"
- "urgency": "low", "medium", "high", or "critical"
"""
    return await _call_gemini_text(prompt)


async def transcribe_audio(audio_text: str) -> Dict[str, Any]:
    prompt = f"""Analyze this transcribed environmental report from an audio/voice recording:

Transcribed text: {audio_text[:5000]}

Return a JSON object with:
- "cleaned_text": cleaned and formatted version of the report
- "report_type": type of environmental issue reported
- "location_mentioned": any location information extracted
- "urgency": "low", "medium", "high", or "critical"
- "key_concerns": array of main concerns mentioned
- "suggested_category": best category for this report
"""
    return await _call_gemini_text(prompt)


async def analyze_sms_report(sms_text: str) -> Dict[str, Any]:
    prompt = f"""Analyze this SMS environmental water report from Uganda.

SMS: {sms_text[:2000]}

Return a JSON object with:
- "cleaned_report": properly formatted report text
- "incident_type": type of incident (broken_pump, contamination, flooding, drought, pollution, etc.)
- "location": extracted location (district, village, etc.)
- "urgency": "low", "medium", "high", or "critical"
- "requires_immediate_action": true/false
- "suggested_department": which department should handle this
- "category": best category for routing this report
"""
    return await _call_gemini_text(prompt)


async def analyze_whatsapp_message(message_text: str, media_context: str = "") -> Dict[str, Any]:
    prompt = f"""Analyze this WhatsApp environmental water report.

Message: {message_text[:3000]}
Media context: {media_context}

Return a JSON object with:
- "processed_report": cleaned report text
- "issue_type": main issue type
- "location": extracted location
- "has_media_evidence": true/false
- "urgency": "low", "medium", "high", or "critical"
- "recommended_action": what should be done
- "assign_to": suggested team or department
"""
    return await _call_gemini_text(prompt)


async def analyze_satellite_imagery(description: str, coordinates: dict = None) -> Dict[str, Any]:
    prompt = f"""Analyze this satellite imagery description for environmental monitoring in Uganda.

Description: {description}
Coordinates: {json.dumps(coordinates) if coordinates else 'Not provided'}

Return a JSON object with:
- "land_cover_analysis": description of land cover observed
- "water_bodies_detected": any water bodies observed and their condition
- "vegetation_health": assessment of vegetation health
- "infrastructure_visible": any water infrastructure visible
- "environmental_concerns": any concerns detected (deforestation, wetland loss, erosion, etc.)
- "change_detection": any notable changes from expected conditions
- "recommended_follow_up": suggested follow-up actions
"""
    return await _call_gemini_text(prompt)


async def classify_pollution_type(
    description: str, image_analysis: str = ""
) -> Dict[str, Any]:
    prompt = f"""Classify this pollution incident based on the description and any image analysis.

Description: {description}
Image Analysis: {image_analysis}

Return a JSON object with:
- "pollution_type": "chemical", "biological", "physical", "agricultural", "industrial", "sewage", or "unknown"
- "confidence": 0-100 score
- "severity": "low", "medium", "high", "critical"
- "hazard_level": "toxic", "hazardous", "moderate", "low"
- "cleanup_suggestion": suggested cleanup approach
- "agencies_to_notify": array of agencies that should be notified
"""
    return await _call_gemini_text(prompt)


async def verify_report_authenticity(
    report_text: str, image_analysis: str = "", location_data: dict = None
) -> Dict[str, Any]:
    prompt = f"""Verify the authenticity of this environmental report.

Report: {report_text[:3000]}
Image Analysis: {image_analysis}
Location: {json.dumps(location_data) if location_data else 'Not provided'}

Return a JSON object with:
- "is_authentic": true/false
- "confidence_score": 0-100
- "flags": array of any suspicious elements
- "verification_notes": explanation of the assessment
- "suggested_verification_steps": what to check further
"""
    return await _call_gemini_text(prompt)


async def detect_duplicate(
    report_text: str, recent_reports: list
) -> Dict[str, Any]:
    prompt = f"""Check if this environmental report is a duplicate of any recent reports.

New Report: {report_text[:2000]}

Recent Reports:
{json.dumps(recent_reports[:5], indent=2)}

Return a JSON object with:
- "is_duplicate": true/false
- "duplicate_of_id": ID of duplicate report if found, or null
- "similarity_score": 0-100
- "matching_fields": which fields match
- "decision": "new_report", "merge_with_existing", or "flag_for_review"
"""
    return await _call_gemini_text(prompt)


async def extract_geospatial_info(text: str) -> Dict[str, Any]:
    prompt = f"""Extract all geospatial information from this environmental report.

Text: {text[:3000]}

Return a JSON object with:
- "districts_mentioned": array of district names
- "villages_mentioned": array of village names
- "water_bodies_mentioned": array of water body names
- "coordinates": any lat/lng mentioned (or null)
- "landmarks": any landmarks mentioned
- "primary_location": the most specific location identified
"""
    return await _call_gemini_text(prompt)


async def _call_gemini_vision(
    prompt: str, image_data: str, image_mime: str
) -> Dict[str, Any]:
    if not GEMINI_API_KEY:
        return {
            "error": "Gemini API key not configured",
            "description": "Analysis unavailable - AI service not fully configured",
            "issues": [],
            "severity": "unknown",
        }
    try:
        parts = [{"text": prompt}]
        if image_data:
            parts.append({
                "inlineData": {
                    "mimeType": image_mime or "image/jpeg",
                    "data": image_data,
                }
            })
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                json={"contents": [{"parts": parts}]},
            )
            result = resp.json()
            text = (
                result.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "{}")
            )
            text = text.replace("```json", "").replace("```", "").strip()
            return json.loads(text) if text else {"description": "No analysis generated"}
    except Exception as e:
        return {"error": str(e), "description": f"Analysis failed: {str(e)}"}


async def _call_gemini_text(prompt: str) -> Dict[str, Any]:
    if not GEMINI_API_KEY:
        return {"error": "Gemini API key not configured"}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
                },
            )
            result = resp.json()
            text = (
                result.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "{}")
            )
            text = text.replace("```json", "").replace("```", "").strip()
            return json.loads(text) if text else {"summary": text[:500]}
    except Exception as e:
        return {"error": str(e)}
