"""Build the synthetic training sets (owner: Faouzi). Synthetic only: no real patient text.

    python -m app.ai.training.make_data          # writes app/ai/data/{intent,triage}_train.v1.jsonl

Training rows are templates crossed with phrasings in English, French, Arabic and Tunisian Darija (Arabic script
and Latin "3arbizi"). The evaluation sets (`*_eval.v1.jsonl`) are hand-written separately and never generated
here, so a model that only memorised these templates scores badly on them.
"""

import itertools
import json
import random
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
SEED = 20261005

# --- Patient assistant intents --------------------------------------------------------------------------------

INTENT_PHRASES = {
    "next_dose": [
        "when is my next pill", "when do I take my medicine", "what time is my next dose", "which medicine now",
        "do I have a dose tonight", "is it time for my tablets",
        "quand est mon prochain médicament", "à quelle heure je prends mes comprimés", "c'est quand la prochaine dose",
        "je dois prendre quel médicament maintenant", "j'ai un traitement ce soir",
        "متى الدواء القادم", "في أي ساعة آخذ الدواء", "ما هو الدواء الذي آخذه الآن", "هل عندي جرعة الليلة",
        "وقتاش ناخو الدواء", "وقتاش الحبوب الجايين", "شنوة الدواء اللي ناخوه توا",
        "wa9tech nekhou dwa", "wa9tech el 7boub", "chnowa dwa eli nekhdhou taw",
    ],
    "next_visit": [
        "when is my next appointment", "when do I see the doctor", "do I have a consultation soon",
        "what day is my follow-up", "when is my next visit",
        "quand est mon prochain rendez-vous", "c'est quand ma consultation", "je vois le médecin quand",
        "j'ai un rdv bientôt", "quelle date pour mon suivi",
        "متى موعدي القادم", "متى أرى الطبيب", "هل عندي موعد قريبا", "ما هو تاريخ المراجعة",
        "وقتاش الموعد متاعي", "وقتاش نشوف الطبيب", "عندي رونديفو قريب",
        "wa9tech el maw3ed mte3i", "wa9tech nchouf tbib", "3andi rendez-vous 9rib",
    ],
    "my_vitals": [
        "what is my temperature", "how is my heart rate", "what is my oxygen level", "show me my vitals",
        "is my pulse normal today",
        "quelle est ma température", "mon rythme cardiaque est comment", "quel est mon taux d'oxygène",
        "montre-moi mes constantes", "ma tension aujourd'hui",
        "كم حرارتي", "كيف نبض قلبي", "كم نسبة الأكسجين عندي", "أرني مؤشراتي الحيوية",
        "قداش السخانة متاعي", "كيفاش القلب متاعي اليوم", "قداش الأكسيجين",
        "9adech skhana mte3i", "kifech 9albi lyoum", "9adech l'oxygène",
    ],
    "urgent": [
        "I can't breathe", "my chest hurts a lot", "I am bleeding", "I feel like fainting", "help me now",
        "j'ai très mal à la poitrine", "je n'arrive pas à respirer", "je saigne beaucoup", "je vais m'évanouir",
        "aidez-moi vite",
        "لا أستطيع التنفس", "صدري يؤلمني بشدة", "أنا أنزف", "أشعر أنني سأغمى", "ساعدوني الآن",
        "ما نجمش نتنفس", "صدري يوجع فيا برشا", "نحس روحي باش نطيح", "عاونوني توا",
        "ma najjamch nitnaffes", "sadri yoja3ni barcha", "n7es rou7i bech ntí7", "3awnouni taw",
    ],
    "ask_staff": [
        "is my illness serious", "why do I take this antibiotic", "can I eat sugar", "will I get better",
        "can I go home tomorrow", "what does my diagnosis mean",
        "est-ce que ma maladie est grave", "pourquoi je prends cet antibiotique", "je peux manger du sucre",
        "est-ce que je vais guérir", "je peux rentrer demain",
        "هل مرضي خطير", "لماذا آخذ هذا المضاد الحيوي", "هل أستطيع أكل السكر", "هل سأشفى",
        "مرضي خطير", "علاش ناخو هالدواء", "نجم نروح غدوة",
        "mardhi khtir", "3lech nekhou had dwa", "najjem nrou7 ghodwa",
    ],
}
INTENT_FRAMES = ["{}", "{}?", "{} ?", "please, {}", "s'il vous plaît {}", "{} please", "excuse me, {}",
                 "bonjour, {}", "سلام، {}", "3aslema {}", "{} svp"]

INTENT_QUESTION = json.loads((Path(__file__).resolve().parent.parent / "rules" / "intents.v1.json")
                             .read_text(encoding="utf-8"))["question"]


def intent_rows(rng: random.Random, per_intent: int = 60) -> list[dict]:
    rows = []
    for label, phrases in INTENT_PHRASES.items():
        combos = list(itertools.product(phrases, INTENT_FRAMES))
        rng.shuffle(combos)
        for phrase, frame in combos[:per_intent]:
            rows.append({"state": {"body": frame.format(phrase)}, "questions": {"intent": INTENT_QUESTION},
                         "expected": {"intent": label}})
    rng.shuffle(rows)
    return rows


# --- Triage referrals (urgency 1-5) ------------------------------------------------------------------------------

TRIAGE_COMPLAINTS = {
    5: ["chest pain radiating to the left arm", "crushing chest pain with sweating", "sudden face drooping and slurred speech",
        "cannot breathe, lips turning blue", "fainted twice this morning", "vomiting blood", "heavy bleeding after a fall",
        "douleur thoracique intense", "douleur dans la poitrine et essoufflement", "perte de connaissance brutale",
        "hémorragie importante", "paralysie soudaine du bras", "bouche déviée et trouble de la parole",
        "ألم شديد في الصدر", "ضيق شديد في التنفس", "إغماء مفاجئ", "نزيف حاد", "شلل مفاجئ في اليد",
        "وجيعة كبيرة في صدري", "ما نجمش نتنفس", "طاح وغاب على روحو",
        "waja3 kbir fi sadri", "ma najjamch nitnaffes", "ghabt 3la rou7i", "dam barcha"],
    4: ["high fever in a 3 month old baby", "fever 39.8 for four days in an elderly man", "worsening abdominal pain with vomiting",
        "severe dehydration, not drinking", "infected wound spreading redness", "confusion since yesterday in an 82 year old",
        "fièvre élevée chez un nourrisson", "douleur abdominale qui s'aggrave", "plaie infectée qui s'étend",
        "fièvre persistante depuis 5 jours chez une personne âgée", "vomissements répétés depuis deux jours",
        "سخانة قوية عند رضيع", "ألم في البطن يزداد مع قيء", "جرح ملتهب يتوسع", "حمى منذ أربعة أيام عند مسن",
        "السخانة طالعة برشا عند الصغير", "كرشي توجع فيا وقاعد نرجع",
        "skhana kbira 3and sghir", "kerchi tooja3ni w nraja3"],
    3: ["cough for three weeks with weight loss", "breast lump found two weeks ago", "abnormal blood test to review",
        "new lump in the neck", "blood in the urine once", "persistent headache for weeks",
        "toux persistante depuis trois semaines", "bosse au sein découverte récemment", "résultat d'analyse anormal",
        "sang dans les urines", "maux de tête persistants depuis des semaines", "perte de poids inexpliquée",
        "سعال مستمر منذ ثلاثة أسابيع", "كتلة في الثدي", "نتيجة تحليل غير طبيعية", "دم في البول", "صداع مستمر منذ أسابيع",
        "كحة من ثلاثة جمعات", "تحليل الدم موش نورمال", "ka7a men tletha jem3at", "ta7lil dam mouch normal"],
    2: ["stable diabetes, treatment renewal", "well controlled hypertension check", "mild knee pain for months",
        "chronic back pain, stable", "thyroid follow-up, no new symptoms", "mild seasonal allergy",
        "diabète stable, adaptation du traitement", "hypertension bien contrôlée", "douleur légère au genou depuis des mois",
        "lombalgie chronique stable", "suivi thyroïde sans nouveau symptôme",
        "سكري مستقر، تجديد العلاج", "ضغط الدم مستقر", "ألم خفيف في الركبة منذ أشهر", "متابعة الغدة الدرقية",
        "السكر مستقر نحب نجدد الدواء", "ركبتي توجع شوية", "sokkor mestaqer", "rkobti tooja3 chwaya"],
    1: ["medical certificate for sport", "prescription renewal and paperwork", "routine annual check, no complaints",
        "vaccination record update", "administrative form to sign", "routine follow-up, all good",
        "certificat médical pour le sport", "renouvellement d'ordonnance", "bilan annuel de routine, aucune plainte",
        "papiers administratifs", "mise à jour du carnet de vaccination",
        "شهادة طبية للرياضة", "تجديد الوصفة", "فحص سنوي روتيني بدون شكوى", "أوراق إدارية",
        "نحب شهادة طبية للسبور", "نحب نجدد الوصفة", "chhada tebbiya lel sport", "nejjded el ordonnance"],
}
TRIAGE_FRAMES = ["{}", "Patient referred for {}", "Référé pour {}", "Motif: {}", "{} - please review",
                 "Lettre de liaison: {}", "تحويل بسبب {}", "{}, no other history", "{}, antécédents: HTA"]


def triage_rows(rng: random.Random, per_level: int = 90) -> list[dict]:
    rows = []
    for urgency, complaints in TRIAGE_COMPLAINTS.items():
        combos = list(itertools.product(complaints, TRIAGE_FRAMES))
        rng.shuffle(combos)
        rows += [{"text": frame.format(c), "urgency": urgency} for c, frame in combos[:per_level]]
    rng.shuffle(rows)
    return rows


def _write(name: str, rows: list[dict]) -> None:
    path = DATA / name
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    print(f"{path.name}: {len(rows)} rows")


if __name__ == "__main__":
    rng = random.Random(SEED)
    _write("intent_train.v1.jsonl", intent_rows(rng))
    _write("triage_train.v1.jsonl", triage_rows(rng))
