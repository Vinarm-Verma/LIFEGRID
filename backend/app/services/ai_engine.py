"""
LIFEGRID Emergency Understanding Engine

Transparent multilingual emergency decision-support engine.

Important:
- This is NOT a medical diagnosis system.
- This is NOT clinically validated triage.
- It provides prototype decision support.
- Explicit user-selected emergency type is respected.
- Unicode is preserved so non-Latin languages can be analysed.
"""

from __future__ import annotations

import re
from typing import Any


# ============================================================
# NORMALISATION
# ============================================================

def _normalise(text: str | None) -> str:
    """
    Preserve Unicode characters.

    The old implementation removed every character outside
    a-z / 0-9. That prevented Hindi, Arabic, Chinese, etc.
    from reaching the multilingual phrase matcher.
    """

    value = str(text or "").casefold().strip()

    # Keep Unicode word characters and whitespace.
    value = re.sub(r"[^\w\s+]+", " ", value, flags=re.UNICODE)

    return re.sub(r"\s+", " ", value).strip()


def _contains(
    text: str,
    phrases: tuple[str, ...],
) -> bool:
    return any(
        phrase in text
        for phrase in phrases
    )


def _label(value: str) -> str:
    return value.replace("_", " ").strip()


# ============================================================
# EMERGENCY TYPE ALIASES
#
# Includes English + commonly used multilingual phrases.
# The explicit UI category always has priority.
# ============================================================

TYPE_ALIASES: dict[str, tuple[str, ...]] = {
    "road_accident": (
        # English
        "road accident",
        "car accident",
        "bike accident",
        "motorcycle accident",
        "vehicle accident",
        "traffic accident",
        "car crash",
        "crash",
        "collision",
        "hit by car",
        "hit by vehicle",

        # Hindi
        "सड़क दुर्घटना",
        "सड़क दुर्घटना",
        "कार दुर्घटना",
        "गाड़ी दुर्घटना",
        "गाड़ी का एक्सीडेंट",
        "एक्सीडेंट",
        "दुर्घटना",

        # Bengali
        "সড়ক দুর্ঘটনা",
        "সড়ক দুর্ঘটনা",
        "গাড়ি দুর্ঘটনা",
        "দুর্ঘটনা",

        # Marathi
        "रस्ता अपघात",
        "रस्ते अपघात",
        "गाडीचा अपघात",
        "अपघात",

        # Gujarati
        "રસ્તા અકસ્માત",
        "કાર અકસ્માત",
        "અકસ્મત",
        "અકસાન",

        # Tamil
        "சாலை விபத்து",
        "கார் விபத்து",
        "விபத்து",

        # Telugu
        "రోడ్డు ప్రమాదం",
        "కారు ప్రమాదం",
        "ప్రమాదం",

        # Punjabi
        "ਸੜਕ ਹਾਦਸਾ",
        "ਕਾਰ ਹਾਦਸਾ",
        "ਹਾਦਸਾ",

        # Urdu
        "سڑک حادثہ",
        "گاڑی حادثہ",
        "حادثہ",

        # German
        "verkehrsunfall",
        "autounfall",
        "unfall",

        # French
        "accident de la route",
        "accident de voiture",

        # Spanish
        "accidente de tráfico",
        "accidente de trafico",
        "accidente de coche",

        # Portuguese
        "acidente de trânsito",
        "acidente de transito",
        "acidente de carro",

        # Italian
        "incidente stradale",
        "incidente d'auto",

        # Dutch
        "verkeersongeval",
        "auto ongeluk",

        # Turkish
        "trafik kazası",
        "araba kazası",

        # Russian
        "дорожная авария",
        "авария",
        "дтп",

        # Arabic
        "حادث سير",
        "حادث سيارة",
        "حادث مروري",

        # Chinese
        "交通事故",
        "车祸",

        # Japanese
        "交通事故",
        "自動車事故",

        # Korean
        "교통사고",
        "자동차 사고",
    ),

    "cardiac_emergency": (
        # English
        "cardiac",
        "heart attack",
        "heart pain",
        "chest pain",
        "chest pressure",
        "chest tightness",
        "palpitations",

        # Hindi
        "दिल का दौरा",
        "दिल में दर्द",
        "सीने में दर्द",
        "सीने में दबाव",

        # Bengali
        "হৃদরোগ",
        "হার্ট অ্যাটাক",
        "বুকে ব্যথা",

        # Marathi
        "हृदयविकाराचा झटका",
        "छातीत दुखणे",

        # Gujarati
        "હાર્ટ એટેક",
        "છાતીમાં દુખાવો",

        # Tamil
        "மாரடைப்பு",
        "நெஞ்சு வலி",

        # Telugu
        "గుండెపోటు",
        "ఛాతీ నొప్పి",

        # Punjabi
        "ਦਿਲ ਦਾ ਦੌਰਾ",
        "ਛਾਤੀ ਵਿੱਚ ਦਰਦ",

        # Urdu
        "دل کا دورہ",
        "سینے میں درد",

        # German
        "herzinfarkt",
        "brustschmerzen",

        # French
        "crise cardiaque",
        "douleur thoracique",

        # Spanish
        "ataque cardíaco",
        "ataque cardiaco",
        "dolor de pecho",

        # Portuguese
        "ataque cardíaco",
        "dor no peito",

        # Italian
        "infarto",
        "dolore al petto",

        # Turkish
        "kalp krizi",
        "göğüs ağrısı",

        # Russian
        "сердечный приступ",
        "боль в груди",

        # Arabic
        "نوبة قلبية",
        "ألم في الصدر",

        # Chinese
        "心脏病发作",
        "胸痛",

        # Japanese
        "心臓発作",
        "胸の痛み",

        # Korean
        "심장마비",
        "가슴 통증",
    ),

    "stroke": (
        "stroke",
        "face drooping",
        "facial droop",
        "slurred speech",
        "speech difficulty",
        "unable to speak",
        "one sided weakness",
        "one side weakness",
        "arm weakness",

        "स्ट्रोक",
        "लकवा",
        "चेहरा टेढ़ा",
        "बोलने में दिक्कत",

        "ব্রেন স্ট্রোক",
        "মুখ বেঁকে যাওয়া",

        "मेंदूचा झटका",
        "अर्धांगवायू",

        "பக்கவாதம்",
        "பேசுவதில் சிரமம்",

        "స్ట్రోక్",
        "మాట్లాడటంలో ఇబ్బంది",

        "뇌졸중",
        "얼굴 마비",

        "脳卒中",
        "顔の麻痺",

        "中风",
        "面部下垂",

        "инсульт",
        "инсульт",

        "accident vasculaire cérébral",
        "avc",

        "accidente cerebrovascular",
        "derrame cerebral",

        "schlaganfall",
    ),

    "severe_bleeding": (
        "severe bleeding",
        "heavy bleeding",
        "bleeding heavily",
        "blood loss",
        "profuse bleeding",
        "bleeding a lot",

        "बहुत ज्यादा खून",
        "बहुत खून बह रहा",
        "तेज रक्तस्राव",
        "खून बह रहा है",

        "প্রচুর রক্তপাত",
        "অনেক রক্তপাত",

        "जोरदार रक्तस्राव",
        "जास्त रक्तस्त्राव",

        "கடுமையான இரத்தப்போக்கு",
        "அதிக இரத்தப்போக்கு",

        "తీవ్రమైన రక్తస్రావం",

        "severe hémorragie",
        "hémorragie grave",

        "sangrado intenso",
        "hemorragia grave",

        "starke blutung",
        "schwere blutung",

        "forte sangramento",

        "тяжелое кровотечение",

        "نزيف شديد",

        "严重出血",

        "重度の出血",

        "심한 출혈",
    ),

    "fire": (
        "fire",
        "burning building",
        "house fire",
        "building fire",
        "flames",
        "smoke inhalation",
        "burn injury",

        "आग",
        "आग लग गई",
        "जलने की चोट",
        "धुआं",

        "আগুন",
        "আগুন লেগেছে",

        "आग लागली",
        "जळीत",

        "આગ લાગી",
        "દાઝવું",

        "தீ",
        "தீ விபத்து",
        "தீக்காயம்",

        "మంట",
        "అగ్ని ప్రమాదం",

        "ਅੱਗ",
        "ਅੱਗ ਲੱਗੀ",

        "حريق",
        "حريق في المبنى",

        "feu",
        "incendie",

        "incendio",

        "brand",
        "feuer",

        "пожар",

        "火灾",
        "火事",

        "화재",
    ),

    "injury": (
        "serious injury",
        "major injury",
        "fracture",
        "broken bone",
        "deep wound",
        "fall from height",
        "fall injury",

        "गंभीर चोट",
        "चोट लग गई",
        "हड्डी टूट गई",
        "गिरने की चोट",

        "গুরুতর আঘাত",
        "হাড় ভেঙে গেছে",

        "गंभीर दुखापत",
        "हाड मोडले",

        "ગંભીર ઈજા",
        "હાડકું તૂટી ગયું",

        "கடுமையான காயம்",
        "எலும்பு முறிவு",

        "తీవ్రమైన గాయం",
        "ఎముక విరిగింది",

        "গুরুতর আঘাত",

        "إصابة خطيرة",
        "كسر",

        "blessure grave",
        "fracture",

        "lesión grave",
        "fractura",

        "schwere verletzung",
        "knochenbruch",

        "тяжелая травма",
        "перелом",

        "严重受伤",
        "骨折",

        "重傷",
        "骨折",

        "심각한 부상",
        "골절",
    ),

    "drowning": (
        "drowning",
        "drowned",
        "under water",
        "cannot swim",

        "डूबना",
        "डूब गया",
        "पानी में डूब",

        "ডুবে যাওয়া",
        "পানিতে ডুবে গেছে",

        "बुडणे",
        "पाण्यात बुडणे",

        "ડૂબવું",

        "நீரில் மூழ்குதல்",

        "మునిగిపోవడం",

        "ਪਾਣੀ ਵਿੱਚ ਡੁੱਬਣਾ",

        "غرق",
        "يغرق",

        "noyade",

        "ahogamiento",

        "ertrinken",

        "annegamento",

        "ан drowning",

        "溺水",

        "溺れる",

        "익사",
    ),
}


# ============================================================
# EMERGENCY TYPE DETECTION
# ============================================================

def detect_emergency_type(
    description: str,
    selected_type: str | None = None,
) -> str:
    """
    Explicit user selection always wins.

    If the user selects "other", the engine attempts
    multilingual detection from the description.
    """

    selected = _normalise(
        selected_type
    ).replace(" ", "_")

    allowed = {
        "medical_emergency",
        "road_accident",
        "train_accident",
        "cardiac_emergency",
        "stroke",
        "severe_bleeding",
        "fire",
        "injury",
        "drowning",
        "other",
    }

    if selected in allowed and selected != "other":
        return selected

    text = _normalise(description)

    for emergency_type, phrases in TYPE_ALIASES.items():
        if _contains(text, phrases):
            return emergency_type

    return "medical_emergency"


# ============================================================
# CONDITION RULES
# ============================================================

CONDITION_RULES: tuple[
    tuple[str, tuple[str, ...], int]
] = (
    (
        "unconscious",
        (
            "unconscious",
            "not conscious",
            "lost consciousness",
            "passed out",
            "unresponsive",
            "not responding",

            "बेहोश",
            "होश नहीं",
            "होश खो दिया",

            "অজ্ঞান",
            "জ্ঞান নেই",

            "बेशुद्ध",
            "शुद्ध हरपली",

            "மயக்கம்",
            "நினைவின்றி",

            "అపస్మారక",
            "స్పృహలో లేరు",

            "فاقد الوعي",
            "فقد الوعي",

            "inconscient",
            "inconsciente",

            "bewusstlos",

            "без сознания",

            "失去意识",
            "意識がない",

            "의식이 없음",
        ),
        40,
    ),

    (
        "severe_bleeding",
        TYPE_ALIASES["severe_bleeding"],
        30,
    ),

    (
        "breathing_difficulty",
        (
            "breathing difficulty",
            "difficulty breathing",
            "trouble breathing",
            "cannot breathe",
            "can't breathe",
            "shortness of breath",
            "breathless",
            "not breathing",

            "सांस लेने में दिक्कत",
            "सांस नहीं आ रही",
            "सांस नहीं ले रहा",

            "শ্বাস নিতে কষ্ট",
            "শ্বাস নিচ্ছে না",

            "श्वास घेण्यास त्रास",

            "શ્વાસ લેવામાં તકલીફ",

            "மூச்சுத்திணறல்",
            "மூச்சு விட முடியவில்லை",

            "శ్వాస తీసుకోవడంలో ఇబ్బంది",

            "ਸਾਹ ਲੈਣ ਵਿੱਚ ਮੁਸ਼ਕਲ",

            "صعوبة في التنفس",
            "لا يتنفس",

            "difficulté à respirer",

            "dificultad para respirar",

            "atemnot",
            "schwer zu atmen",

            "difficoltà respiratoria",

            "затрудненное дыхание",

            "呼吸困难",

            "呼吸ができない",

            "호흡 곤란",
        ),
        30,
    ),

    (
        "chest_pain",
        (
            "chest pain",
            "chest pressure",
            "chest tightness",

            "सीने में दर्द",
            "सीने में दबाव",

            "বুকে ব্যথা",

            "छातीत दुखणे",

            "છાતીમાં દુખાવો",

            "நெஞ்சு வலி",

            "ఛాతీ నొప్పి",

            "ਛਾਤੀ ਵਿੱਚ ਦਰਦ",

            "سینے میں درد",

            "douleur thoracique",

            "dolor de pecho",

            "brustschmerzen",

            "dor no peito",

            "dolore al petto",

            "боль в груди",

            "ألم في الصدر",

            "胸痛",

            "胸の痛み",

            "가슴 통증",
        ),
        25,
    ),

    (
        "major_trauma",
        (
            "major trauma",
            "head injury",
            "head wound",
            "serious injury",
            "severe injury",
            "fracture",
            "broken bone",
            "fall from height",
            "crash",
            "collision",
            "road accident",
            "car accident",
            "bike accident",

            "सिर में चोट",
            "गंभीर चोट",
            "हड्डी टूट गई",
            "ऊंचाई से गिरना",

            "মাথায় আঘাত",
            "হাড় ভেঙে গেছে",

            "डोक्याला दुखापत",
            "हाड मोडले",

            "માથામાં ઈજા",
            "હાડકું તૂટી ગયું",

            "தலையில் காயம்",
            "எலும்பு முறிவு",

            "తల గాయం",
            "ఎముక విరిగింది",

            "ਸਿਰ ਦੀ ਸੱਟ",
            "ਹੱਡੀ ਟੁੱਟ ਗਈ",

            "إصابة في الرأس",
            "كسر",

            "blessure à la tête",
            "fracture",

            "kopfwunde",
            "knochenbruch",

            "lesión en la cabeza",
            "fractura",

            "травма головы",
            "перелом",

            "头部受伤",
            "骨折",

            "頭部外傷",
            "골절",
        ),
        25,
    ),

    (
        "burn_injury",
        (
            "burn",
            "burned",
            "burnt",
            "flames",
            "fire",

            "जल गया",
            "जलने की चोट",
            "आग",

            "পুড়ে গেছে",
            "আগুন",

            "जळले",
            "आग लागली",

            "દાઝવું",
            "આગ",

            "தீக்காயம்",
            "தீ",

            "కాలిన గాయం",
            "మంట",

            "ਦਾਗ਼",
            "ਅੱਗ",

            "حرق",
            "حريق",

            "brûlure",
            "incendie",

            "quemadura",
            "incendio",

            "verbrennung",
            "brand",

            "ожог",
            "пожар",

            "烧伤",
            "火灾",

            "やけど",
            "火事",

            "화상",
            "화재",
        ),
        25,
    ),

    (
        "stroke_symptoms",
        TYPE_ALIASES["stroke"],
        25,
    ),

    (
        "minor_injury",
        (
            "minor injury",
            "small cut",
            "small wound",
            "scrape",
            "bruise",
            "minor burn",
        ),
        5,
    ),
)


# ============================================================
# CONDITION EXTRACTION
# ============================================================

def extract_conditions(
    text: str,
) -> tuple[list[str], int]:
    conditions: list[str] = []
    score = 0

    for condition, phrases, points in CONDITION_RULES:
        if _contains(text, phrases):
            conditions.append(condition)
            score += points

    return conditions, score


# ============================================================
# RESOURCE RECOMMENDATION
# ============================================================

def required_resources_for(
    emergency_type: str,
    conditions: list[str],
    patient_count: int,
) -> list[str]:

    resources: list[str] = [
        "emergency_department"
    ]

    if (
        emergency_type
        in {
            "road_accident",
            "train_accident",
            "injury",
        }
        or "major_trauma" in conditions
    ):
        resources.append(
            "trauma_capability"
        )

    if (
        emergency_type == "fire"
        or "burn_injury" in conditions
    ):
        resources.append("burn_care")

    if (
        emergency_type
        == "cardiac_emergency"
        or "chest_pain" in conditions
    ):
        resources.append(
            "cardiac_capability"
        )

    if (
        emergency_type == "stroke"
        or "stroke_symptoms" in conditions
    ):
        resources.append(
            "stroke_capability"
        )

    if "breathing_difficulty" in conditions:
        resources.append(
            "oxygen_support"
        )

    if (
        "unconscious" in conditions
        or "breathing_difficulty" in conditions
    ):
        resources.append(
            "advanced_ambulance"
        )
    else:
        resources.append("ambulance")

    if "severe_bleeding" in conditions:
        resources.append(
            "blood_assessment"
        )

    if emergency_type == "drowning":
        resources.append(
            "water_rescue_capability"
        )

    if patient_count >= 3:
        resources.append(
            "multi_patient_capacity"
        )

    return list(
        dict.fromkeys(resources)
    )


# ============================================================
# PUBLIC ANALYSIS
# ============================================================

def analyze_emergency(
    description: str,
    patient_count: int = 1,
    emergency_type: str | None = None,
) -> dict[str, Any]:
    """
    Analyse a multilingual emergency report.

    The returned information is structured so that the
    matching and coordination layers can use it.
    """

    safe_description = str(
        description or ""
    ).strip()

    text = _normalise(
        safe_description
    )

    patients = max(
        1,
        int(patient_count or 1),
    )

    detected_type = detect_emergency_type(
        safe_description,
        selected_type=emergency_type,
    )

    conditions, score = extract_conditions(
        text
    )

    type_bonus = {
        "cardiac_emergency": 25,
        "stroke": 25,
        "severe_bleeding": 30,
        "road_accident": 10,
        "train_accident": 15,
        "fire": 15,
        "injury": 10,
        "drowning": 25,
        "medical_emergency": 0,
        "other": 0,
    }.get(
        detected_type,
        0,
    )

    score += type_bonus

    if patients >= 2:
        score += min(
            10,
            (patients - 1) * 5,
        )

    score = min(
        100,
        max(0, score),
    )

    if score >= 80:
        severity = "critical"
    elif score >= 50:
        severity = "high"
    elif score >= 25:
        severity = "moderate"
    else:
        severity = "low"

    resources = required_resources_for(
        emergency_type=detected_type,
        conditions=conditions,
        patient_count=patients,
    )

    condition_text = (
        ", ".join(
            _label(condition)
            for condition in conditions
        )
        if conditions
        else "no specific critical condition detected"
    )

    summary = (
        f"Detected {_label(detected_type)} "
        f"involving {patients} patient(s). "
        f"Observed conditions: {condition_text}. "
        f"Prototype severity classification: "
        f"{severity}. "
        f"Suggested resources: "
        f"{', '.join(_label(resource) for resource in resources)}."
    )

    return {
        "emergency_type": detected_type,
        "patient_count": patients,
        "conditions": conditions,
        "severity": severity,
        "severity_score": score,
        "required_resources": resources,
        "ai_summary": summary,
        "decision_support_notice": (
            "Prototype decision support only; "
            "not a clinically validated triage "
            "system or medical diagnosis."
        ),
    }