"""Triage scorer: hard red-flag rules + a trained classifier, no LLM (owner: Faouzi).

urgency = max(red-flag floor, trained model, risk-mass rule, 2 if age >= 75). The model can only raise urgency
above the floor, never lower it. A red flag that is explicitly denied ("pas de douleur thoracique") is not applied;
the model then decides alone. Without the shipped model file it degrades to the rules alone. A human always
confirms the result.
"""

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel

from app.ai import textclf

RULES = Path(__file__).parent / "rules" / "red_flags.v2.json"
SCALE = Path(__file__).parent / "rules" / "triage_scale.v1.json"
ELDERLY_AGE = 75
URGENT_LEVEL = 4  # the "very urgent" level the risk-mass rule protects
RISK_TAU = 0.3  # fallback for P(urgency >= 4) when the model file carries no tau of its own (see train_textclf.py)


class TriageResult(BaseModel):
    urgency: int
    reasons: list[str]
    red_flags: list[str]
    source: str  # "model" (rules + trained classifier) | "rules" (no model file shipped)
    model_urgency: int | None = None
    confidence: float | None = None
    scale: dict | None = None


_ARABIC_VARIANTS = str.maketrans({"ى": "ي", "ة": "ه", "ـ": None})
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")  # Arabic-Indic and Persian digits

# ---- negation ------------------------------------------------------------------------------------------------
# A cue governs the next few words: up to a sentence end, a contrast word ("but", "juste", "برك") or a comma.
# "or / ni / ولا / wala" continue the scope; for the verbs of denial ("denies", "ينفي") a comma continues it too.
# Cues are symptom-noun negations only. Inability verbs ("can't breathe", "ma najjamch nitnaffes",
# "لا يستطيع التنفس", "ne peut plus parler") are not cues, and keywords marked "affirm" ignore negation.
_VERB_AFTER_LA = ("يستطيع|تستطيع|استطيع|نستطيع|يقدر|تقدر|اقدر|نقدر|يتنفس|تتنفس|استجيب|يستجيب|تستجيب|يتحرك|تتحرك|يستيقظ|تستيقظ|يفيق|"
                  "تفيق|يتكلم|تتكلم|يتوقف|تتوقف|يعرف|تعرف|يعي|تعي|يرد|ترد|يشعر|تشعر|يحس|تحس|يقوي|تقوي|يبلع|تبلع|ينام")
_CUES = re.compile("|".join([
    r"\bno\b(?! (?:longer|one|body)\b)",
    r"\bnot\b(?! (?:\w+ing|able|going|sure)\b)",
    r"\bnever\b", r"\bwithout\b", r"\bzero\b", r"\bnegative for\b", r"\bfree of\b",
    r"\b(?:have|has|had|did|do|does)(?:n't| not) (?=(?:had|have|any|get|got|feel|felt|experienc\w+|a|an)\b)",
    r"\bpas d(?:e\b|')", r"\bsans\b", r"\bni\b", r"\baucun(?:e|s|es)?\b", r"\babsence d(?:e\b|')", r"\bjamais\b",
    r"(?<!\S)(?:لا يوجد|لا توجد|ليس لدي|ليس عندي|ليس هناك|لا اعاني من|لا يعاني من|لا تعاني من|لا اشكو من|لا يشكو من|ليس|ليست|بدون|بلا|عدم|من غير|دون)(?!\S)",
    rf"(?<!\S)(?:لا|لم|لن)(?= )(?! (?:{_VERB_AFTER_LA})(?!\S))",
    r"(?<!\S)(?:ما عنديش|ما عندوش|ما عندهاش|ما عندناش|ما عندهمش|ما عندي|ما فماش|ما فما|مافماش|ما فيش|ماني|ماهوش|ماهيش|ما هوش|ما نحسش|ما يحسش|ما تحسش|ما فيهش|ما بيهش)(?!\S)",
    r"\bma\s?3and\w*", r"\bma\s?f[ae]mm?[ae]\w*", r"\bmafi\b", r"\bma\s?n7ess\w*", r"\bbla\b",
    r"\bla (?=(?:\S*\d\S*|dowkha|tension)\b)",
]))
_LIST_CUES = re.compile("|".join([
    r"\bden(?:y|ies|ied|ying)\b", r"\bnie\b", r"\bniee?\b", r"(?<!\S)(?:ينفي|تنفي|انفي|نفت|نفى|نفي|ينكر|تنكر)(?!\S)",
]))
_CONNECTORS = frozenset(("or", "nor", "ni", "ou", "wala", "ولا"))
_STOP = frozenset(("can't", "cant", "cannot", "couldn't", "unable", "ne", "n'arrive", "ma", "ما", "يستطيع", "تستطيع", "استطيع", "نستطيع", "يقدر",
                   "تقدر", "اقدر", "نقدر", "يتنفس", "تتنفس", "يستجيب", "تستجيب", "يتحرك", "تتحرك", "يستيقظ", "يفيق", "تفيق", "but", "mais", "however", "though", "although", "except", "sauf", "juste", "just", "only", "seulement",
                   "simplement", "simply", "bark", "barka", "برك", "فقط", "لكن", "ولكن", "لاكن", "lakin", "walakin", "ama",
                   "sinon", "need", "needs", "besoin", "want", "wants", "veux", "voudrais", "nheb", "نحب", "اريد"))
_SCOPE_WORDS = 5
_AFFIRM_AFTER_NEVER = re.compile(r"like this|like that|this bad|before|comme ca|auparavant|de ma vie|ma 3umri|ما عمري")
_ELDERLY_CLUE = re.compile(
    r"\b(?:elderly|old (?:man|woman|lady|gentleman)|grand(?:ma|pa|mother|father|dad|ad|ny|-mere|-pere)|gran|nan|nana|granny|mamie|papi|papy|vieux|vieille|"
    r"personne agee|aged? (?:7[5-9]|8\d|9\d)|(?:7[5-9]|8\d|9\d) ?(?:y\.?o\b|yo\b|yrs?\b|years?|ans?\b|f\b|m\b)|3ajouz|jedd|jedda|"
    r"(?:7[5-9]|8\d|9\d) (?:snin|sana))|عجوز|مسن|مسنه|كبير في السن|جدي|جدتي|جدي|جده",
)


def _normalize(text: str) -> str:
    # Drop every combining mark (French accents, Arabic harakat/hamza marks); keywords get the same treatment.
    decomposed = unicodedata.normalize("NFKD", text.lower())
    kept = "".join(ch for ch in decomposed if not unicodedata.combining(ch)).translate(_ARABIC_VARIANTS)
    return re.sub(r"\s+", " ", kept).strip()


def _rule_text(text: str) -> str:
    """What the rules see: the model's normalisation plus curly apostrophes and Arabic-Indic digits."""
    return _normalize(text).replace("’", "'").translate(_DIGITS)


class _Elderly:
    """A term of an "all" keyword that holds when the age field is 75+ or the text carries an elderly clue."""


def _term(t):
    if isinstance(t, dict) and "regex" in t:
        return re.compile(t["regex"])
    if isinstance(t, dict) and t.get("context") == "elderly":
        return _Elderly()
    return re.compile(re.escape(_normalize(t)))


def load_rules(path: Path) -> list[dict]:
    """Rule flags from a JSON file, with every keyword compiled to (terms that must all appear, affirm)."""
    flags = json.loads(path.read_text(encoding="utf-8"))["flags"]
    for f in flags:
        # A plain string is a one-term keyword; {"all": [...]} needs every term; {"regex": ...} is one regex term.
        f["norm_keywords"] = [
            ([_term(t) for t in (k["all"] if isinstance(k, dict) and "all" in k else [k])],
             bool(isinstance(k, dict) and k.get("affirm")))
            for k in f["keywords"]]
    return flags


@lru_cache
def _flags() -> list[dict]:
    return load_rules(RULES)


def _scopes(t: str) -> list[tuple[int, int]]:
    """Character spans of `t` that a negation cue governs."""
    spans = []
    for rx, listy in ((_CUES, False), (_LIST_CUES, True)):
        for m in rx.finditer(t):
            if m.group(0) == "never":
                tail = t[m.end():m.end() + 60]
                if _AFFIRM_AFTER_NEVER.search(tail):
                    continue
            end, left = m.end(), _SCOPE_WORDS
            toks = list(re.finditer(r"\S+", t[m.end():]))
            for i, tok in enumerate(toks):
                word = tok.group(0).strip(".,;:!?،؛؟()\"'")
                if word in _STOP:
                    break
                end = m.end() + tok.end()
                if tok.group(0)[-1] in ".;:!?؛؟":
                    break
                if word in _CONNECTORS:
                    left = _SCOPE_WORDS
                else:
                    left -= 1
                    if left < 0:
                        break
                if tok.group(0)[-1] in ",،":
                    nxt = toks[i + 1].group(0).strip(".,;:!?،؛؟") if i + 1 < len(toks) else ""
                    if not (listy or nxt in _CONNECTORS):
                        break
            spans.append((m.end(), end))
    return spans


def _live(term, t: str, scopes: list[tuple[int, int]], age: int | None, ignore_negation: bool) -> bool:
    """The term is present and, unless negation is ignored, at least one occurrence is outside every negation scope."""
    if isinstance(term, _Elderly):
        return (age or 0) >= ELDERLY_AGE or bool(_ELDERLY_CLUE.search(t))
    for m in term.finditer(t):
        if ignore_negation or not any(m.start() < b and m.end() > a for a, b in scopes):
            return True
    return False


def model_text(text: str) -> str:
    """The triage classifier's input: the rule normalisation with every negated span removed, so that "pas de douleur
    thoracique" reaches the model as "pas de" and cannot be mistaken for the symptom."""
    t = _rule_text(text)
    out, pos = [], 0
    for a, b in sorted(_scopes(t)):
        if a >= pos:
            out.append(t[pos:a])
            pos = b
        elif b > pos:
            pos = b
    out.append(t[pos:])
    return re.sub(r"\s+", " ", "".join(out)).strip()


def scan_rules(flags: list[dict], text: str, age: int | None = None) -> tuple[list[dict], list[dict]]:
    """(flags that apply, flags whose wording is present only inside a negation)."""
    t = _rule_text(text)
    scopes = _scopes(t)
    applied, negated = [], []
    for f in flags:
        for terms, affirm in f["norm_keywords"]:
            if all(_live(x, t, scopes, age, affirm) for x in terms):
                applied.append(f)
                break
        else:
            if scopes and any(all(_live(x, t, scopes, age, True) for x in terms) for terms, _ in f["norm_keywords"]):
                negated.append(f)
    return applied, negated


def _scan(text: str, age: int | None = None) -> tuple[list[dict], list[dict]]:
    return scan_rules(_flags(), text, age)


def match_red_flags(text: str, age: int | None = None) -> list[dict]:
    return _scan(text, age)[0]


def rule_floor(text: str, age: int | None = None) -> int:
    return max((f["min_urgency"] for f in match_red_flags(text, age)), default=1)


@lru_cache
def _scale() -> dict:
    return json.loads(SCALE.read_text(encoding="utf-8"))


def scale_label(urgency: int) -> dict:
    s = _scale()
    return {"name": s["name"], "level": s["levels"][str(urgency)], "confirmed": bool(s["confirmed"])}


def risk_mass(probs: dict) -> float:
    """P(urgency >= URGENT_LEVEL) under the model's class probabilities."""
    return sum(p for u, p in probs.items() if u >= URGENT_LEVEL)


def triage(referral_text: str, symptoms: list[str], age: int | None) -> TriageResult:
    full_text = " ".join([referral_text, *symptoms])
    matched, negated = _scan(full_text, age)
    flag_ids = [f["id"] for f in matched]
    floor = max((f["min_urgency"] for f in matched), default=1)
    reasons = [f"Red flag: {i.replace('_', ' ')} (urgency at least {f['min_urgency']})"
               for i, f in zip(flag_ids, matched)]
    reasons += [f"Red-flag wording denied, not applied: {f['id'].replace('_', ' ')}" for f in negated]

    urgency, model_u, conf = floor, None, None
    model = textclf.load("triage.v2")
    if model is not None:
        probs = textclf.predict_proba(model, model_text(full_text))
        model_u, conf = max(probs.items(), key=lambda kv: kv[1])
        conf = round(conf, 2)
        reasons.append(f"Similar referrals were urgency {model_u} (model confidence {conf:.0%})")
        urgency = max(urgency, model_u)
        tau = model.get("risk_tau", RISK_TAU) if isinstance(model, dict) else RISK_TAU
        mass = risk_mass(probs)
        if mass >= tau and urgency < URGENT_LEVEL:
            urgency = URGENT_LEVEL
            reasons.append(f"Model unsure: {mass:.0%} chance of urgency {URGENT_LEVEL} or more "
                           f"(threshold {tau:.0%}), raised to {URGENT_LEVEL} for a person to review")
    if (age or 0) >= ELDERLY_AGE and urgency < 2:
        urgency = 2
        reasons.append(f"Age {age}: routine requests are raised to urgency 2")
    if not reasons:
        reasons = ["No red flag found; routine priority"]
    return TriageResult(urgency=urgency, reasons=reasons, red_flags=flag_ids,
                        source="model" if model is not None else "rules", model_urgency=model_u, confidence=conf,
                        scale=scale_label(urgency))
