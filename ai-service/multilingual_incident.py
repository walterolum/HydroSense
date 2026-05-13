"""
HYDROSENSE v4.0 Enhanced Multilingual Incident Analysis & Classification
AI-powered analysis of citizen reports in any Ugandan language with automatic
translation, severity assessment, location extraction, and intelligent routing.
"""

import os, json, logging, re
from typing import Optional, Dict, Any, List
import httpx

logger = logging.getLogger("hydrosense.incident")

UGANDA_DISTRICTS = [
    "Kampala", "Gulu", "Lira", "Moroto", "Kotido", "Soroti", "Mbale", "Jinja",
    "Masaka", "Mbarara", "Kasese", "Kabale", "Hoima", "Adjumani", "Yumbe",
    "Arua", "Busia", "Tororo", "Fort Portal", "Apac", "Luwero", "Mukono",
    "Wakiso", "Kayunga", "Bundibugyo", "Nebbi", "Moyo", "Kitgum", "Pader",
]

SEVERITY_WEIGHTS = {"low": 20, "medium": 45, "high": 70, "critical": 90, "emergency": 95}

AGENCY_MAP = {
    "water_contamination": ["Ministry of Water", "Health Department", "Environmental Authority"],
    "broken_water_point": ["District Water Office", "Maintenance Team", "Technician Unit"],
    "flooding": ["Emergency Response", "Disaster Management", "District Administration"],
    "sewage_leak": ["Sanitation Department", "Health Department", "Municipal Council"],
    "illegal_dumping": ["Environmental Authority", "Enforcement Unit", "District Council"],
    "pollution": ["National Environment Authority", "Water Quality Division", "Health Department"],
    "environmental_hazard": ["Environmental Protection", "Disaster Response", "District Administration"],
    "infrastructure_damage": ["Infrastructure Division", "District Engineer", "Maintenance Team"],
    "other": ["District Administration", "General Response"],
}

async def analyze_multilingual_report(
    text: str,
    source_language: str = "auto",
    district: Optional[str] = None,
    sub_county: Optional[str] = None,
    village: Optional[str] = None,
    incident_type: Optional[str] = None,
    channel: str = "app",
    original_text: Optional[str] = None,
) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "")
    use_gemini = bool(api_key)

    if use_gemini:
        try:
            return await _gemini_analysis(
                text, source_language, district, sub_county, village,
                incident_type, channel, original_text
            )
        except Exception as exc:
            logger.error(f"Gemini analysis failed: {exc}")

    return _rule_based_analysis(text, district, sub_county, village, incident_type, original_text)


async def _gemini_analysis(
    text: str, source_language: str, district: Optional[str],
    sub_county: Optional[str], village: Optional[str],
    incident_type: Optional[str], channel: str, original_text: Optional[str],
) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "")

    lang_hint = "English"
    lang_codes = {
        "lug": "Luganda", "nyn": "Runyankole", "teo": "Ateso",
        "luo": "Luo", "lgg": "Lugbara", "xog": "Lusoga",
        "cgg": "Rukiga", "ach": "Acholi", "swa": "Swahili",
    }
    if source_language and source_language != "auto" and source_language != "en":
        lang_hint = lang_codes.get(source_language, source_language)

    prompt = f"""You are an AI incident analyst for HYDROSENSE, Uganda's water and environmental management platform.
Analyze the following citizen report and extract structured information.
The report may be in {lang_hint} or another local language.

Return JSON ONLY with these fields:
- english_summary: English translation/summary preserving ALL details, urgency, and emotion
- original_language_detected: ISO code of the language used (en, lug, nyn, teo, luo, lgg, xog, cgg, ach, swa)
- incident_category: one of [water_contamination, broken_water_point, flooding, sewage_leak, illegal_dumping, pollution, environmental_hazard, infrastructure_damage, other]
- severity: one of [low, medium, high, critical]
- urgency: one of [low, medium, high, emergency]
- risk_score: number 0-100
- confidence_score: number 0-100
- extracted_location: specific location details (village, landmark, sub-county)
- detected_district: specific Ugandan district if mentioned (must be one of: {', '.join(UGANDA_DISTRICTS)})
- detected_sub_county: sub-county if mentioned
- detected_village: village or area if mentioned
- recommended_action: brief response recommendation
- affected_population_estimate: estimated number of affected people (0 if unknown)
- key_issues: array of key problems identified (2-5 items)
- environmental_impact: description of environmental impact
- is_emergency: boolean - true if life/safety at immediate risk
- suggested_departments: array of departments that should respond
- water_source_affected: type of water source if identifiable (borehole, spring, well, tap, piped_scheme, pond, river, other, unknown)

Report text: {text[:3000]}
{f"Reported district: {district}" if district else ""}
{f"Reported sub-county: {sub_county}" if sub_county else ""}
{f"Reported village: {village}" if village else ""}
{f"Reported incident type: {incident_type}" if incident_type else ""}
{f"Channel: {channel}" if channel else ""}
{f"Original text (different language): {original_text[:1000]}" if original_text and original_text != text else ""}"""

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 3072},
            }
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={api_key}"
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            raw = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")

            json_match = re.search(r'\{.*\}', raw, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                return _normalize_analysis(result, source_language, district, incident_type, original_text, channel)

            return _rule_based_analysis(text, district, sub_county, village, incident_type, original_text)

    except Exception as exc:
        logger.error(f"Gemini incident analysis failed: {exc}")
        raise


def _normalize_analysis(
    result: dict, source_language: str, district: Optional[str],
    incident_type: Optional[str], original_text: Optional[str], channel: str,
) -> Dict[str, Any]:
    risk = min(max(result.get("risk_score", 0), 0), 100)
    conf = min(max(result.get("confidence_score", 50), 0), 100)

    return {
        "translated_summary": result.get("english_summary", "") or original_text or "",
        "ai_category": result.get("incident_category", incident_type or "other"),
        "ai_severity": result.get("severity", "medium"),
        "ai_urgency": result.get("urgency", "medium"),
        "ai_risk_score": risk,
        "confidence_score": conf,
        "extracted_location": result.get("extracted_location", ""),
        "detected_district": result.get("detected_district", district or ""),
        "detected_sub_county": result.get("detected_sub_county", ""),
        "detected_village": result.get("detected_village", ""),
        "detected_language": result.get("original_language_detected", source_language),
        "response_recommendation": result.get("recommended_action", ""),
        "affected_population": result.get("affected_population_estimate", 0),
        "key_issues": result.get("key_issues", []),
        "environmental_impact": result.get("environmental_impact", ""),
        "is_emergency": result.get("is_emergency", False),
        "suggested_departments": result.get("suggested_departments", AGENCY_MAP.get(result.get("incident_category", "other"), [])),
        "water_source_affected": result.get("water_source_affected", "unknown"),
        "source_language": source_language,
        "analysis_source": "gemini",
        "channel": channel,
        "original_text": original_text or "",
    }


def _rule_based_analysis(
    text: str, district: Optional[str] = None,
    sub_county: Optional[str] = None, village: Optional[str] = None,
    incident_type: Optional[str] = None, original_text: Optional[str] = None,
) -> Dict[str, Any]:
    text_lower = (text + " " + (original_text or "")).lower()

    keywords = {
        "water_contamination": ["contamination", "dirty water", "brown water", "smell", "taste", "cholera", "typhoid", "amazzi", "chafu"],
        "broken_water_point": ["broken", "not working", "no water", "pump", "borehole", "taps", "bomba", "kuharibika"],
        "flooding": ["flood", "water rising", "heavy rain", "submerged", "amata", "mafuriko", "enkuba"],
        "sewage_leak": ["sewage", "waste", "feces", "toilet", "latrine", "overflow", "taka", "ekivundu", "odeni"],
        "illegal_dumping": ["dumping", "garbage", "trash", "rubbish", "taka"],
        "pollution": ["pollution", "chemical", "oil", "factory", "industrial", "uchafuzi"],
        "environmental_hazard": ["hazard", "danger", "landslide", "erosion", "fire", "hatari"],
        "infrastructure_damage": ["damage", "destroyed", "collapsed", "cracked", "broken pipe"],
    }

    detected_type = incident_type or "other"
    max_score = 0
    for itype, words in keywords.items():
        score = sum(1 for w in words if w in text_lower)
        if score > max_score:
            max_score = score
            detected_type = itype

    severity_map = {"critical": 90, "high": 70, "medium": 45, "low": 20, "emergency": 95}
    urgency_words = {
        "emergency": ["emergency", "urgent", "immediately", "danger", "death", "dying", "critical", "d'angwe", "haraka", "hatari"],
        "high": ["serious", "severe", "bad", "many", "worsening", "kabi", "mbaya", "kali"],
        "medium": ["need", "help", "problem", "issue", "taabu", "msaada"],
    }
    severity = "low"
    for sev, words in urgency_words.items():
        if any(w in text_lower for w in words):
            severity = sev
            break

    risk = severity_map.get(severity, 45)
    detected_district = district or ""
    for d in UGANDA_DISTRICTS:
        if d.lower() in text_lower:
            detected_district = d
            break

    detected_village = village or ""
    detected_sub_county = sub_county or ""

    if not detected_village:
        v_match = re.search(r'(?:village|kyalo|gweng|kijiji|anga|ader)\s+(\w+(?:\s+\w+){0,3})', text_lower)
        if v_match:
            detected_village = v_match.group(1).strip().title()

    return {
        "translated_summary": text[:500],
        "ai_category": detected_type,
        "ai_severity": severity,
        "ai_urgency": severity if severity in ("emergency", "high", "medium") else "low",
        "ai_risk_score": risk,
        "confidence_score": 65.0,
        "extracted_location": f"{detected_village + ', ' if detected_village else ''}{detected_sub_county + ', ' if detected_sub_county else ''}{detected_district}".strip(", "),
        "detected_district": detected_district,
        "detected_sub_county": detected_sub_county,
        "detected_village": detected_village,
        "detected_language": "auto",
        "response_recommendation": _recommend_action(detected_type, severity),
        "affected_population": 0,
        "key_issues": [f"{detected_type.replace('_', ' ').title()} reported"],
        "environmental_impact": "",
        "is_emergency": severity in ("emergency", "critical"),
        "suggested_departments": AGENCY_MAP.get(detected_type, ["District Administration"]),
        "water_source_affected": "unknown",
        "source_language": "auto",
        "analysis_source": "rule_based",
        "channel": "app",
        "original_text": original_text or "",
    }


def _recommend_action(category: str, severity: str) -> str:
    actions = {
        "water_contamination": "Deploy water quality testing team immediately. Issue public health advisory. Notify health department.",
        "broken_water_point": "Dispatch maintenance technician. Assess damage. Arrange temporary water supply if needed.",
        "flooding": "Activate emergency response. Coordinate with disaster management. Assess evacuation needs.",
        "sewage_leak": "Contact sanitation department. Deploy cleanup team. Post warning signs. Notify health officials.",
        "illegal_dumping": "Dispatch enforcement unit. Document evidence. Arrange waste removal. Issue citation.",
        "pollution": "Deploy environmental assessment team. Test water quality. Contain pollution source.",
        "environmental_hazard": "Secure affected area. Hazard assessment required. Notify environmental protection agency.",
        "infrastructure_damage": "Engineer assessment needed. Safety inspection. Contact maintenance and infrastructure division.",
    }
    base = actions.get(category, "Investigate and assign to appropriate department based on severity and location.")
    if severity in ("emergency", "critical"):
        base = "[EMERGENCY RESPONSE REQUIRED] " + base
    return base
