"""red_flags.v2: scoped negation (both directions, every language), the new provisional families, age context."""

import json

import pytest

from app.ai import triage as T


def flags(text: str, age: int | None = None) -> list[str]:
    return [f["id"] for f in T.match_red_flags(text, age)]


# ---- a denied symptom is ignored; the same words said plainly still fire -------------------------------------------
DENIED = [
    ("en", "No chest pain, just a certificate for my employer", "chest_pain"),
    ("en", "Denies chest pain, shortness of breath or palpitations; wants a vaccine", "chest_pain"),
    ("en", "Denies chest pain, shortness of breath or palpitations; wants a vaccine", "breathing"),
    ("en", "pregnant, no bleeding, just very painful periods", "pregnancy_bleeding"),
    ("en", "never had a seizure or fainting, I just want advice", "seizure"),
    ("en", "without chest pain, wants a certificate", "chest_pain"),
    ("fr", "Pas de douleur thoracique, juste un certificat médical", "chest_pain"),
    ("fr", "sans douleur thoracique ni essoufflement juste bilan annuel", "breathing"),
    ("fr", "Aucune douleur thoracique depuis hier", "chest_pain"),
    ("fr", "enceinte, pas de saignement, juste un test de grossesse", "pregnancy_bleeding"),
    ("ar", "لا ألم في الصدر، أريد شهادة طبية", "chest_pain"),
    ("ar", "لا نزيف ولا ضيق تنفس، أحتاج فقط وصفة", "severe_bleeding"),
    ("ar", "لا نزيف ولا ضيق تنفس، أحتاج فقط وصفة", "breathing"),
    ("ar", "ينفي ضيق التنفس ويرغب في ملف طبي للسفر", "breathing"),
    ("ar", "ليس لدي ضيق نفس", "breathing"),
    ("darija_ar", "ما عنديش ألم في الصدر، برك شهادة", "chest_pain"),
    ("darija_ar", "ما فماش نزيف والحمد لله، موعد متابعة برك", "severe_bleeding"),
    ("darija_ar", "ما نحسش بالنزيف، برك عندي حرقة خفيفة", "severe_bleeding"),
    ("darija_latin", "ma 3andich waja3 fi sadri, juste certificat", "chest_pain"),
    ("darija_latin", "ma fammech dem w ma fammech waja3 fil sder, bark ordonnance", "severe_bleeding"),
    ("darija_latin", "pas de fievre pas de toux nheb attestation", "high_fever_child"),
]
STATED = [
    ("en", "chest pain since this morning, no fever", "chest_pain"),
    ("en", "no fever, chest pain since this morning", "chest_pain"),
    ("en", "I never felt chest pain like this before", "chest_pain"),
    ("en", "pregnant with bleeding since morning", "pregnancy_bleeding"),
    ("fr", "douleur thoracique depuis hier", "chest_pain"),
    ("fr", "pas de fièvre, douleur thoracique intense depuis ce matin", "chest_pain"),
    ("fr", "pas de toux mais essoufflement important", "breathing"),
    ("ar", "ألم في الصدر منذ ساعة", "chest_pain"),
    ("ar", "لا حمى لكن ألم في الصدر", "chest_pain"),
    ("darija_ar", "ما عنديش سخانة، وجع في صدري برشا", "chest_pain"),
    ("darija_latin", "3andi waja3 fi sadri", "chest_pain"),
    ("darija_latin", "ma 3andich s5ana, 3andi waja3 fil sder", "chest_pain"),
]


@pytest.mark.parametrize("lang,text,flag", DENIED)
def test_denied_symptom_does_not_fire(lang, text, flag):
    assert flag not in flags(text)


@pytest.mark.parametrize("lang,text,flag", STATED)
def test_stated_symptom_still_fires(lang, text, flag):
    assert flag in flags(text)


# ---- inability verbs ARE the symptom: never dropped, even next to a denial ----------------------------------------
INABILITY = [
    ("en", "I can't breathe"),
    ("en", "he cannot breathe and no fever"),
    ("en", "no fever or can't breathe"),
    ("en", "She is not breathing"),
    ("en", "no longer breathing"),
    ("fr", "Il ne peut plus respirer"),
    ("fr", "pas de fièvre, ne respire plus"),
    ("fr", "Il ne peut plus parler et sa bouche est tordue"),
    ("ar", "لا يستطيع التنفس منذ ساعة"),
    ("ar", "لا يتنفس ولا يستجيب"),
    ("ar", "لا حمى ولا يستطيع التنفس"),
    ("darija_ar", "ما نجمش نتنفس"),
    ("darija_ar", "ما عنديش سخانة، ما نجمش نتنفس"),
    ("darija_latin", "ma najjamch nitnaffes"),
    ("darija_latin", "ma nnajjamch nitnaffes"),
    ("darija_latin", "ma 3andich s5ana, ma nnajjamch nitnaffes"),
]


@pytest.mark.parametrize("lang,text", INABILITY)
def test_inability_to_breathe_or_speak_is_never_negated(lang, text):
    assert {"breathing", "stroke_signs", "loss_of_consciousness"} & set(flags(text))


def test_negated_flag_is_reported_and_model_input_drops_the_denied_words(monkeypatch):
    text = "pas de douleur thoracique, juste un certificat"
    matched, negated = T._scan(text)
    assert matched == [] and [f["id"] for f in negated] == ["chest_pain"]
    assert "thoracique" not in T.model_text(text) and "certificat" in T.model_text(text)
    monkeypatch.setattr(T.textclf, "load", lambda name: None)
    r = T.triage(text, [], 40)
    assert r.red_flags == [] and any(x.startswith("Red-flag wording denied") for x in r.reasons)
    # an inability phrase survives the scoping of the model input
    assert "nitnaffes" in T.model_text("ma 3andich s5ana, ma nnajjamch nitnaffes")


# ---- the nine new families -----------------------------------------------------------------------------------------
NEW = {
    "thunderclap_headache": ["worst headache of my life, came on in seconds", "mal de tête brutal, le pire de ma vie",
                             "صداع مفاجئ هو الأسوأ في حياتي", "sdaa3 bghta ma 3umri 7asseit haka"],
    "hypertensive_crisis": ["BP 195/115 at home, pounding headache and blurred vision", "tension 20/11 avec mal de tête",
                            "ضغط الدم ٢٠٠/١٢٠ مع صداع شديد", "dhaghta 210 w sdaa3 w dowkha"],
    "reduced_fetal_movement": ["pregnant at 34 weeks and the baby is moving less today", "le bébé ne bouge presque plus depuis hier",
                               "الجنين ما عادش يتحرك من البارح", "7amla w l baby ma 3adch y7arrek"],
    "sepsis": ["fever 39.5, shaking chills and confused, breathing fast", "fièvre 39 avec confusion et tachycardie",
               "حمى مرتفعة مع ارتباك وهبوط في الضغط"],
    "acute_abdomen": ["severe abdominal pain with fever since last night", "douleur abdominale atroce avec fièvre et vomissements",
                      "ألم شديد في البطن مع حمى"],
    "head_injury": ["fell off his bike, hit his head and has vomited twice", "chute sur la tête, vomit, sous anticoagulant",
                    "ضربة على الرأس مع تقيؤ عند مريض يتناول مميعات الدم"],
    "diabetic_emergency": ["blood sugar 38 mg/dL, sweaty and shaking", "diabetic foot with a black toe and a bad smell",
                           "pied diabétique noir avec mauvaise odeur"],
}


@pytest.mark.parametrize("flag,text", [(f, t) for f, texts in NEW.items() for t in texts])
def test_new_family_fires(flag, text):
    assert flag in flags(text)


ELDERLY = {
    "elderly_confusion": ["my grandmother is suddenly confused and doesn't know where she is",
                          "grand-père désorienté depuis ce matin", "جدتي مرتبكة منذ الصباح"],
    "elderly_fall": ["grandad fell on the ice and can't put weight on his leg", "ma grand-mère est tombée, elle ne peut pas se lever",
                     "جدي سقط ولا يستطيع الوقوف"],
}


@pytest.mark.parametrize("flag,text", [(f, t) for f, texts in ELDERLY.items() for t in texts])
def test_elderly_family_fires_on_a_clue_in_the_text(flag, text):
    assert flag in flags(text)


def test_elderly_family_needs_an_age_or_a_clue():
    assert "elderly_confusion" not in flags("he is confused and agitated", 40)
    assert "elderly_confusion" in flags("he is confused and agitated", 82)
    assert "elderly_fall" not in flags("slipped on the step, can't put weight on the leg", 30)
    assert "elderly_fall" in flags("slipped on the step, can't put weight on the leg", 80)


@pytest.mark.parametrize("text", [
    "routine check-up and blood pressure review", "renouvellement d'ordonnance pour le diabète", "headache for two days, mild",
    "bébé de 5 mois, vaccin du jour", "mal au ventre après le repas", "I fell asleep on the sofa", "ما عندي مشكل، موعد متابعة",
    "BP 130/80 at the pharmacy", "sugar 6 mmol/L fasting, no symptoms", "twisted ankle, can walk",
])
def test_new_families_do_not_fire_on_routine_text(text):
    assert flags(text, 30) == []


# ---- the rule file ---------------------------------------------------------------------------------------------------
def test_new_flags_are_provisional_and_at_urgency_four():
    data = json.loads(T.RULES.read_text(encoding="utf-8"))["flags"]
    new = {"thunderclap_headache", "hypertensive_crisis", "reduced_fetal_movement", "elderly_confusion", "elderly_fall",
           "diabetic_emergency", "acute_abdomen", "head_injury", "sepsis"}
    by_id = {f["id"]: f for f in data}
    assert new <= set(by_id)
    for fid in new:
        assert by_id[fid]["min_urgency"] == 4 and by_id[fid]["provisional"] is True and "doctors" in by_id[fid]["note"]
    assert not any(f.get("provisional") for fid, f in by_id.items() if fid not in new)
