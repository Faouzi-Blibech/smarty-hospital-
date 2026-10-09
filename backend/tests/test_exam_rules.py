from app.ai.exams import DEPARTMENTS, MAX_EXAMS, catalogue, suggest_exams


def codes(text, flags=()):
    return [e["code"] for e in suggest_exams(text, list(flags))["exams"]]


def test_chest_pain_flag_gives_the_cardiac_set():
    out = suggest_exams("douleur thoracique depuis deux jours", ["chest_pain"])
    assert [e["code"] for e in out["exams"]] == ["ecg", "troponin", "chest_xray"]
    assert out["source"] == "rules" and out["bundles"] == ["chest_pain"]
    assert out["exams"][0] == {"code": "ecg", "label": "ECG (12-lead)", "department": "Cardiology"}


def test_keywords_in_three_languages():
    assert codes("Palpitations at night") == ["ecg", "echo"]
    assert codes("Fièvre et toux productive depuis 5 jours") == ["cbc", "crp", "chest_xray"]
    assert codes("حمى وسعال منذ ثلاثة أيام") == ["cbc", "crp", "chest_xray"]
    assert codes("Routine diabetes follow-up, HbA1c review") == ["hba1c", "creatinine"]
    assert codes("Bleeding gums since warfarin dose change") == ["inr", "cbc"]


def test_no_match_and_cap():
    assert codes("Annual check-up, no complaints") == []
    many = codes("chest pain with fever and cough, swelling of the leg", ["chest_pain"])
    assert len(many) == MAX_EXAMS == 4 and len(set(many)) == 4


def test_rules_file_is_consistent():
    cat = catalogue()
    assert all(v["department"] in DEPARTMENTS and v["label"] for v in cat.values())
    from app.ai.exams import _rules

    for b in _rules()["bundles"]:
        assert b["exams"] and all(c in cat for c in b["exams"]), b["id"]
        assert b.get("red_flags") or b.get("keywords"), b["id"]
