"""
HYDROSENSE v4.0 Enhanced Multilingual Translation Engine
Speech-to-text, language detection, environmental terminology preservation,
SMS/WhatsApp parsing, and multi-channel report translation.
"""

import os, json, logging, base64, hashlib, re
from typing import Optional, Dict, List, Tuple
import httpx

logger = logging.getLogger("hydrosense.translation")

LANGUAGE_CODES = {
    "en": "English", "lug": "Luganda", "nyn": "Runyankole",
    "teo": "Ateso", "luo": "Luo", "lgg": "Lugbara",
    "xog": "Lusoga", "cgg": "Rukiga", "ach": "Acholi", "swa": "Swahili",
}

LANG_NAMES_TO_CODES = {v.lower(): k for k, v in LANGUAGE_CODES.items()}

ENVIRONMENTAL_TERMS = {
    "lug": {
        "amazzi": "water", "ekivundu": "sewage", "ekikolwa": "environment",
        "enkuba": "rain", "omwalo": "valley/dam", "ensiko": "forest",
        "ettaka": "soil/land", "omusulo": "spring", "akaliba": "tap",
        "ebbomba": "pipe", "ekiyinja": "pond", "olusege": "wetland",
        "obulimbo": "mud", "ekyoto": "setting", "okufuula": "pollute",
        "obutonde": "nature", "ekiwuka": "insect", "okusenyuka": "collapse",
        "amata": "flood", "okwokya": "burn", "emitwe": "chemicals",
    },
    "swa": {
        "maji": "water", "taka": "waste", "mazingira": "environment",
        "mvua": "rain", "bwawa": "dam", "msitu": "forest",
        "ardhi": "land", "chanzo": "spring", "bomba": "pipe",
        "ziwa": "lake", "kinamasi": "swamp", "matope": "mud",
        "uchafuzi": "pollution", "asili": "nature", "kemikali": "chemical",
        "mafuriko": "flood", "kupasuka": "burst", "kuharibika": "damage",
    },
}

TRANSLATION_CACHE: Dict[str, str] = {}
SMS_PATTERNS = re.compile(
    r"(?i)(?:report|ripoti|tendo|li?po?ota|ikiri?|chuno|riipota)[:\s]*(.+)"
)
WHATSAPP_FORWARD_RE = re.compile(r"(?i)(?:forwarded|from|kutoka|okuva|kuva)\s*[:\-]")

def _cache_key(text: str, source: str, target: str) -> str:
    return hashlib.md5(f"{source}:{target}:{text[:500]}".encode()).hexdigest()

async def translate_text(
    text: str,
    target_language: str,
    source_language: str = "auto",
    preserve_terminology: bool = True,
) -> dict:
    if not text.strip():
        return {"translated_text": "", "source": "empty", "detected_language": source_language}

    cache_key = _cache_key(text, source_language, target_language)
    cached = TRANSLATION_CACHE.get(cache_key)
    if cached:
        return {"translated_text": cached, "from_cache": True, "detected_language": source_language}

    api_key = os.getenv("GEMINI_API_KEY", "")
    target_name = LANGUAGE_CODES.get(target_language, target_language)
    source_name = LANGUAGE_CODES.get(source_language, source_language) if source_language != "auto" else "the original language"

    term_guide = ""
    if preserve_terminology and source_language in ENVIRONMENTAL_TERMS:
        terms = ENVIRONMENTAL_TERMS[source_language]
        term_guide = "Preserve these environmental terms in context:\n" + "\n".join(
            f"  {k} = {v}" for k, v in terms.items()
        )

    prompt = (
        f"You are a professional environmental translator for HYDROSENSE — Uganda's water platform. "
        f"Translate the following text from {source_name} to {target_name}. "
        f"Preserve the meaning, urgency, emotion, and ALL environmental/water terminology. "
        f"Keep numbers, locations, dates, and times EXACTLY as stated. "
        f"If the text describes an emergency or urgent situation, ensure the translation reflects the same level of urgency. "
        f"Return ONLY the translated text, no explanations, quotes, or extra formatting.\n\n"
        f"{term_guide}\n\n" if term_guide else ""
    ) + f"Text: {text}"

    if not api_key:
        return {"translated_text": text, "source": "passthrough", "detected_language": source_language}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 2048},
            }
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={api_key}"
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            translated = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
            if translated:
                TRANSLATION_CACHE[cache_key] = translated
                if len(TRANSLATION_CACHE) > 1000:
                    TRANSLATION_CACHE.clear()
                return {"translated_text": translated, "source": "gemini", "detected_language": source_language}
    except Exception as exc:
        logger.warning(f"Translation via Gemini failed: {exc}")

    return {"translated_text": text, "source": "passthrough", "detected_language": source_language}


async def transcribe_audio(
    audio_bytes: bytes,
    language: str = "auto",
    mime_type: str = "audio/webm",
) -> dict:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return {"text": "", "english_translation": "", "error": "Gemini API key not configured"}

    try:
        b64 = base64.b64encode(audio_bytes).decode()
        lang_hint = LANGUAGE_CODES.get(language, language) if language != "auto" else "the detected language"

        prompt = (
            f"Transcribe the speech in this audio recording to text. "
            f"The language may be {lang_hint} or another Ugandan language (Luganda, Runyankole, Ateso, Luo, "
            f"Lugbara, Lusoga, Rukiga, Acholi, Swahili). "
            f"Return JSON ONLY with these fields:\n"
            f"- transcribed_text: the exact words spoken in the original language\n"
            f"- detected_language: the ISO code of the language spoken (en, lug, nyn, teo, luo, lgg, xog, cgg, ach, swa)\n"
            f"- english_translation: an English translation of what was said\n"
            f"- urgency: one of [low, medium, high, emergency] based on the tone and content\n"
            f"- environmental_terms: array of any environmental/water terms detected\n"
            f"- location_mentions: array of any place/location names mentioned\n"
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {"inlineData": {"mimeType": mime_type, "data": b64}},
                    ]
                }],
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 4096},
            }
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={api_key}"
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            raw = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")

            json_match = re.search(r'\{.*\}', raw, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                return {
                    "text": result.get("transcribed_text", ""),
                    "english_translation": result.get("english_translation", ""),
                    "detected_language": result.get("detected_language", language),
                    "urgency": result.get("urgency", "medium"),
                    "environmental_terms": result.get("environmental_terms", []),
                    "location_mentions": result.get("location_mentions", []),
                    "source": "gemini",
                }
            return {"text": raw, "english_translation": "", "source": "gemini_raw", "detected_language": language}
    except Exception as exc:
        logger.error(f"Transcription failed: {exc}")
        return {"text": "", "english_translation": "", "error": str(exc), "source": "error"}


async def detect_language(text: str) -> Tuple[str, str]:
    """Detect language, returns (iso_code, language_name)."""
    text = text.strip()
    if not text:
        return "en", "English"

    api_key = os.getenv("GEMINI_API_KEY", "")
    if api_key:
        prompt = (
            f"Identify the language of this text. It may be one of: English, Luganda, Runyankole, Ateso, Luo, "
            f"Lugbara, Lusoga, Rukiga, Acholi, Swahili. "
            f"Return JSON ONLY: {{\"iso\": \"...\", \"name\": \"...\"}}\n\nText: {text[:500]}"
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                payload = {"contents": [{"parts": [{"text": prompt}]}]}
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={api_key}"
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                raw = resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                m = re.search(r'\{.*\}', raw, re.DOTALL)
                if m:
                    result = json.loads(m.group())
                    code = result.get("iso", "").lower()
                    if code in LANGUAGE_CODES:
                        return code, LANGUAGE_CODES[code]
        except Exception:
            pass

    for iso, name in LANGUAGE_CODES.items():
        if name.lower() in text.lower()[:100]:
            return iso, name
    return "en", "English"


async def analyze_sms_report(text: str) -> dict:
    """Parse an SMS/WhatsApp-style report and extract structured data."""
    cleaned = WHATSAPP_FORWARD_RE.sub("", text).strip()
    content_match = SMS_PATTERNS.search(cleaned)
    content = content_match.group(1).strip() if content_match else cleaned

    lang_code, lang_name = await detect_language(content)
    translation = await translate_text(content, "en", lang_code) if lang_code != "en" else {"translated_text": content}

    extracted = {
        "original_text": text,
        "extracted_content": content,
        "detected_language": lang_code,
        "detected_language_name": lang_name,
        "english_translation": translation.get("translated_text", content),
        "channel": "sms",
    }

    keywords = {
        "water_contamination": ["dirty", "brown", "smell", "taste", "contaminated", "cholera", "typhoid", "amazzi", "mafia", "chafu"],
        "broken_water_point": ["broken", "not working", "no water", "pump", "borehole", "taps", "bomba", "ebbenne", "kuharibika"],
        "flooding": ["flood", "water rising", "heavy rain", "submerged", "amata", "mafuriko", "enkuba", "mvua"],
        "sewage_leak": ["sewage", "waste", "feces", "toilet", "latrine", "overflow", "taka", "ekivundu", "odeni"],
        "illegal_dumping": ["dumping", "garbage", "trash", "rubbish", "taka", "okuteguka"],
        "pollution": ["pollution", "chemical", "oil", "factory", "industrial", "uchafuzi", "okufuula"],
        "environmental_hazard": ["hazard", "danger", "landslide", "erosion", "fire", "hatari", "akabi"],
        "infrastructure_damage": ["damage", "destroyed", "collapsed", "cracked", "broken pipe", "kuharibika", "okusenyuka"],
    }

    text_lower = (content + " " + translation.get("translated_text", "")).lower()
    detected_type = "other"
    max_score = 0
    for itype, words in keywords.items():
        score = sum(1 for w in words if w in text_lower)
        if score > max_score:
            max_score = score
            detected_type = itype

    severity_words = {
        "emergency": ["emergency", "urgent", "immediately", "danger", "death", "dying", "critical", "d'angwe", "d'awol", "haraka", "hatari"],
        "high": ["serious", "severe", "bad", "many", "worsening", "quickly", "kabi", "mbaya", "kali"],
        "medium": ["need", "help", "problem", "issue", "concern", "nsaasira", "msaada", "taabu"],
    }
    severity = "low"
    for sev, words in severity_words.items():
        if any(w in text_lower for w in words):
            severity = sev
            break

    extracted["incident_type"] = detected_type
    extracted["severity"] = severity
    return extracted


async def analyze_whatsapp_report(text: str, media_caption: Optional[str] = None) -> dict:
    """Parse WhatsApp-style report with optional media caption."""
    combined = text
    if media_caption:
        combined = f"{text}\nCaption: {media_caption}"
    result = await analyze_sms_report(combined)
    result["channel"] = "whatsapp"
    if media_caption:
        result["has_media"] = True
    return result


async def translate_report_notification(
    message: str,
    target_language: str,
    include_summary: bool = True,
) -> dict:
    """Translate a notification/alert message for citizen delivery."""
    result = await translate_text(message, target_language, "en")
    return {
        "translated_message": result.get("translated_text", message),
        "language": target_language,
        "language_name": LANGUAGE_CODES.get(target_language, target_language),
        "source": result.get("source", "passthrough"),
    }


async def batch_translate(
    texts: List[str],
    target_language: str,
    source_language: str = "auto",
) -> List[str]:
    """Translate multiple texts efficiently."""
    results = []
    for text in texts:
        result = await translate_text(text, target_language, source_language)
        results.append(result.get("translated_text", text))
    return results
