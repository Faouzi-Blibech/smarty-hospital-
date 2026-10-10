import pytest

from app.ai import triage as T


def test_red_flag_floor_chest_pain():
    r = T.triage("Douleur thoracique depuis 2 jours", [], 55)
    assert r.urgency == 5 and "chest_pain" in r.red_flags and r.source == "model"


@pytest.mark.parametrize("text", ["ألم في الصدر منذ يومين", "3andi waja3 fi sadri", "chest pain at rest"])
def test_red_flag_arabic_and_darija(text):
    assert T.triage(text, [], 40).urgency == 5


@pytest.mark.parametrize("text,flag", [
    ("douleurs thoraciques depuis hier", "chest_pain"),
    ("ضيق التنفس شديد", "breathing"),
    ("ألم فى الصدر", "chest_pain"),
    ("enceinte et saignement depuis ce matin", "pregnancy_bleeding"),
    ("fièvre du nourrisson 39.5", "high_fever_child"),
    ("ma nnajjamch nitnaffes", "breathing"),
])
def test_red_flag_common_phrasings(text, flag):
    assert flag in [f["id"] for f in T.match_red_flags(text)]


def test_routine_text_is_low_urgency():
    r = T.triage("Demande de justificatif administratif pour mon employeur", [], 30)
    assert r.urgency in (1, 2) and r.model_urgency is not None


def test_elderly_routine_is_raised():
    r = T.triage("Demande de justificatif administratif pour mon employeur", [], 80)
    assert r.urgency >= 2 and any("Age 80" in x for x in r.reasons)


def test_without_model_falls_back_to_rules(monkeypatch):
    monkeypatch.setattr(T.textclf, "load", lambda name: None)
    r = T.triage("Demande de justificatif administratif pour mon employeur", [], 30)
    assert r.source == "rules" and r.urgency == T.rule_floor("Demande de justificatif administratif pour mon employeur") == 1
    assert r.reasons == ["No red flag found; routine priority"]
    assert r.model_urgency is None


def test_model_can_raise_but_never_lower(monkeypatch):
    monkeypatch.setattr(T.textclf, "load", lambda name: {"fake": True})
    monkeypatch.setattr(T.textclf, "predict_proba", lambda m, text: {1: 0.9, 5: 0.1})
    r = T.triage("Douleur thoracique depuis 2 jours", [], 40)
    assert r.urgency == 5 and r.model_urgency == 1


def test_scale_label_maps_our_urgency_to_the_hospital_scale():
    from app.ai.triage import scale_label, triage

    assert scale_label(5) == {"name": "FRENCH", "level": "Tri 1", "confirmed": False}
    assert scale_label(1)["level"] == "Tri 5"
    assert triage("douleur thoracique", [], 50).scale == scale_label(5)


# Phrasings the first rule file missed (suicide, seizure, overdose, anaphylaxis); each must raise its own flag to 5.
@pytest.mark.parametrize("text,flag", [
    ("patient a fait une tentative de suicide hier", "suicide_self_harm"),
    ("I want to kill myself, I have pills ready", "suicide_self_harm"),
    ("il veut mettre fin a ses jours, idees suicidaires", "suicide_self_harm"),
    ("أفكر في الانتحار", "suicide_self_harm"),
    ("nheb nmout, n9atel rou7i", "suicide_self_harm"),
    ("crise convulsive ce matin", "seizure"),
    ("my son had a seizure for 5 minutes", "seizure"),
    ("طفلي عنده تشنجات", "seizure"),
    ("weldi 3andou sar3 w techennoj", "seizure"),
    ("took 30 paracetamol tablets", "overdose"),
    ("suspicion d'intoxication medicamenteuse", "overdose"),
    ("il a avale tous les comprimes", "overdose"),
    ("ولدي تسمم بالدواء", "overdose"),
    ("chrab barcha dwa, bla3 dwa lkol", "overdose"),
    ("swelling of the throat after eating peanuts, hard to swallow", "anaphylaxis"),
    ("choc anaphylactique apres piqure de guepe", "anaphylaxis"),
    ("gorge qui gonfle apres un medicament", "anaphylaxis"),
    ("عنده حساسية وما يقدرش يتنفس", "anaphylaxis"),
    ("7asasiya w ma najjamch nitnaffes", "anaphylaxis"),
])
def test_safety_red_flags_floor_is_five(text, flag):
    assert flag in [f["id"] for f in T.match_red_flags(text)]
    r = T.triage(text, [], 30)
    assert r.urgency == 5 and flag in r.red_flags


@pytest.mark.parametrize("text", [
    "routine checkup for blood pressure", "renouvellement d'ordonnance", "suivi diabete",
    "I took my blood pressure at home", "mal de gorge depuis 3 jours", "bilan sanguin de routine",
])
def test_safety_flags_do_not_fire_on_routine_text(text):
    new = {"suicide_self_harm", "anaphylaxis", "seizure", "overdose", "medication_error"}
    assert not new & {f["id"] for f in T.match_red_flags(text)}


def _fake_model(monkeypatch, probs):
    monkeypatch.setattr(T.textclf, "load", lambda name: {"fake": True})
    monkeypatch.setattr(T.textclf, "predict_proba", lambda m, text: probs)


def test_risk_mass_raises_an_unsure_case_to_four(monkeypatch):
    # argmax is 1 but 31% of the mass sits on urgency 4-5: at the default tau a person must look at it
    _fake_model(monkeypatch, {1: 0.38, 2: 0.31, 4: 0.21, 5: 0.10})
    r = T.triage("renouvellement d'ordonnance", [], 30)
    assert r.red_flags == [] and r.urgency == 4 and r.model_urgency == 1 and r.confidence == 0.38
    assert any(x.startswith("Model unsure: 31% chance of urgency 4 or more") for x in r.reasons)


def test_risk_mass_below_tau_changes_nothing(monkeypatch):
    _fake_model(monkeypatch, {1: 0.6, 2: 0.2, 3: 0.08, 4: 0.07, 5: 0.05})
    r = T.triage("renouvellement d'ordonnance", [], 30)
    assert r.urgency == 1 and not any("Model unsure" in x for x in r.reasons)


def test_a_flat_distribution_no_longer_defaults_to_three(monkeypatch):
    # the old "unsure -> 3" rule is gone: low confidence alone is not a reason to raise
    _fake_model(monkeypatch, {1: 0.3, 2: 0.3, 3: 0.3, 4: 0.05, 5: 0.05})
    assert T.triage("renouvellement d'ordonnance", [], 30).urgency == 1


def test_the_model_file_carries_its_own_tau(monkeypatch):
    monkeypatch.setattr(T.textclf, "load", lambda name: {"risk_tau": 0.6})
    monkeypatch.setattr(T.textclf, "predict_proba", lambda m, text: {1: 0.5, 4: 0.3, 5: 0.2})
    assert T.triage("renouvellement d'ordonnance", [], 30).urgency == 1  # mass 0.5 < 0.6
    monkeypatch.setattr(T.textclf, "predict_proba", lambda m, text: {1: 0.3, 4: 0.4, 5: 0.3})
    assert T.triage("renouvellement d'ordonnance", [], 30).urgency == 4  # mass 0.7 >= 0.6


def test_risk_mass_never_lowers_a_red_flag(monkeypatch):
    _fake_model(monkeypatch, {1: 0.9, 2: 0.1})
    r = T.triage("I want to kill myself", [], 30)
    assert r.urgency == 5 and "suicide_self_harm" in r.red_flags and not any("Model unsure" in x for x in r.reasons)


def test_a_denied_red_flag_leaves_the_decision_to_the_model(monkeypatch):
    _fake_model(monkeypatch, {1: 0.9, 2: 0.1})
    r = T.triage("pas de douleur thoracique, juste un certificat", [], 30)
    assert r.red_flags == [] and r.urgency == 1
