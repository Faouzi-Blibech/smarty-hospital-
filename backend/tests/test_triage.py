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
