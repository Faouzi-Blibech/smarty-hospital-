"""Triage scorer: hard red-flag rules + a trained classifier, no LLM (owner: Faouzi).

urgency = max(red-flag floor, trained model, risk-mass rule, 2 if age >= 75). The model can only raise urgency
above the floor, never lower it. A red flag that is explicitly denied ("pas de douleur thoracique") or that is only
past history ("AVC en 2019") is not applied; the model, which always reads the full text, then decides alone.
Without the shipped model file it degrades to the rules alone. A human always confirms the result.
"""

import json
import re
import unicodedata
from bisect import bisect_right
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel

from app.ai import textclf

RULES = Path(__file__).parent / "rules" / "red_flags.v2.json"
SCALE = Path(__file__).parent / "rules" / "triage_scale.v1.json"
ELDERLY_AGE = 75
URGENT_LEVEL = 4  # the "very urgent" level the risk-mass rule protects
RISK_TAU = 0.3  # fallback for P(urgency >= 4) when the model file carries no tau of its own (see train_textclf.py)
MAX_TEXT = 4000  # characters of referral + symptoms that triage reads (the API caps each field; this bounds the join)
MIN_LETTERS = 3  # below this the text is not understood: urgency 3 and a person reviews it
NOT_UNDERSTOOD = "Text not understood: a person should review"


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

# ---- keyword matching ---------------------------------------------------------------------------------------------
# String keywords match whole tokens: "الم" does not match inside "المريض", "gran" not inside "grande". A trailing "*"
# marks a stem ("suicid*"). Arabic keywords take the attached proclitics (و ف ب ل ك ال) and pronoun suffixes.
_AR_LETTER = re.compile("[؀-ۿ]")
_AR_PRE = "[وف]?(?:[بلكمع]?ال|لل|[بلك])?"
_AR_SUF = "(?:ي|ه|ها|هم|ك|كم|نا|ني|و|وا|ا|ت|تو|تي|ات|ين|ون|ان|ش)?"

# ---- negation -----------------------------------------------------------------------------------------------------
# A cue governs the noun phrase right after it: optional fillers ("a", "any", "de", "حتى"), one token, and a second
# token only when no other red-flag keyword starts there. "or / ni / ولا / wala" extend it to the next item of an
# enumeration. Punctuation, "and / et / w / و", contrast and time words, inability verbs and a new keyword end it; a
# non-symptom head ("improvement", "ATCD", "raison") is governed and ends it. Only a match that STARTS on a governed
# token is negated. Inability verbs ("can't breathe", "ma najjamch nitnaffes", "لا يستطيع التنفس") are not cues, and
# keywords marked "affirm" ignore negation.
_VERB_AFTER_LA = ("يستطيع|تستطيع|استطيع|نستطيع|يقدر|تقدر|اقدر|نقدر|يتنفس|تتنفس|استجيب|يستجيب|تستجيب|يتحرك|تتحرك|يستيقظ|تستيقظ|يفيق|"
                  "تفيق|يتكلم|تتكلم|يتوقف|تتوقف|يعرف|تعرف|يعي|تعي|يرد|ترد|يشعر|تشعر|يحس|تحس|يقوي|تقوي|يبلع|تبلع|ينام")
_CUES = re.compile("|".join([
    r"\bno\b(?! (?:longer|one|body)\b)",
    r"\bnot\b(?! (?:\w+ing|able|going|sure)\b)",
    r"\bnever\b", r"\bwithout\b", r"\bzero\b", r"\bnegative for\b", r"\bfree of\b",
    r"\b(?:have|has|had|did|do|does)(?:n't| not) (?=(?:had|have|any|get|got|feel|felt|experienc\w+|a|an)\b)",
    r"\bden(?:y|ies|ied|ying)\b", r"\bnie\b", r"\bniee?\b",
    r"\bpas d(?:e\b|')", r"\bsans\b", r"\bni\b", r"\baucun(?:e|s|es)?\b", r"\babsence d(?:e\b|')", r"\bjamais\b",
    r"(?<!\S)و?(?:لا يوجد|لا توجد|ليس لدي|ليس عندي|ليس هناك|لا اعاني من|لا يعاني من|لا تعاني من|لا اشكو من|لا يشكو من|ليس|ليست|بدون|بلا|عدم|من غير|دون)(?!\S)",
    rf"(?<!\S)(?:لا|لم|لن)(?= )(?! (?:{_VERB_AFTER_LA})(?!\S))",
    r"(?<!\S)و?(?:ينفي|تنفي|انفي|نفت|نفى|نفي|ينكر|تنكر)(?!\S)",
    r"(?<!\S)و?(?:ما عنديش|ما عندوش|ما عندهاش|ما عندناش|ما عندهمش|ما عندي|ما فماش|ما فما|مافماش|ما فيش|ماني|ماهوش|ماهيش|ما هوش|ما نحسش|ما يحسش|ما تحسش|ما فيهش|ما بيهش)(?!\S)",
    r"\bma\s?3and\w*", r"\bma\s?f[ae]mm?[ae]\w*", r"\bmafi\b", r"\bma\s?n7ess\w*", r"\bbla\b",
    r"\bla (?=(?:\S*\d\S*|dowkha|tension)\b)",
]))
_PRIVATIVE = frozenset(("sans", "without", "بلا", "بدون", "دون", "من غير", "bla"))  # "pas sans" / "not without" cancel
_NEGATORS = frozenset(("not", "no", "never", "pas", "jamais", "isn't", "isnt", "wasn't", "aren't", "ما", "لا", "ليس",
                       "لم", "مش", "موش", "ماهوش", "ماهيش", "mech", "moch", "mouch", "mich", "ma"))
_NEVER = frozenset(("never", "jamais", "لم"))
# "never ... like this", "jamais ... pareil", "لم ... بهذه القوه": an affirmation of a new symptom, not a denial
_AFFIRM_AFTER_NEVER = re.compile(
    r"\b(?:like (?:this|that|it)|this bad|so bad|so much|this much|before|in my life|of my life|comme (?:ca|cela|celle-ci|"
    r"celui-ci)|pareil\w*|auparavant|avant|de ma vie|ma 3umri|ma 3omri|kima hakka|kif hakka|hakka|haka)\b|"
    r"(?<!\w)(?:هكا|هكه|هكذا|بهذه القوه|بهذا الشكل|بهالشكل|من قبل|قبل|كيما هكا|ما عمري)(?!\w)")
_CONNECTORS = frozenset(("or", "nor", "ni", "ou", "wala", "walla", "ولا", "او"))
_TERMINATORS = frozenset((
    "and", "et", "w", "و", "but", "mais", "however", "though", "although", "except", "sauf", "لكن", "ولكن", "لاكن", "اما",
    "lakin", "walakin", "ama", "now", "maintenant", "توا", "tawa", "الان", "then", "puis", "ensuite", "today",
    "aujourd'hui", "اليوم", "lyoum", "still", "toujours", "mazel", "مازال", "juste", "just", "only", "seulement",
    "simplement", "simply", "bark", "barka", "برك", "فقط", "sinon", "need", "needs", "besoin", "want", "wants", "veux",
    "voudrais", "nheb", "نحب", "اريد",
    # inability verbs: the symptom itself, never part of a denied noun phrase
    "can't", "cant", "cannot", "couldn't", "unable", "ne", "n'", "ma", "ما", "يستطيع", "تستطيع", "استطيع", "نستطيع",
    "يقدر", "تقدر", "اقدر", "نقدر", "يتنفس", "تتنفس", "يستجيب", "تستجيب", "يتحرك", "تتحرك", "يستيقظ", "يفيق", "تفيق",
))
_STOPPERS = frozenset((  # non-symptom heads: the cue governs them and the scope ends there
    "improvement", "improvment", "amelioration", "تحسن", "relief", "soulagement", "response", "reponse", "history",
    "hx", "atcd", "atcds", "pmh", "antecedent", "antecedents", "سوابق", "allergies", "allergy", "allergie",
    "allergique", "raison", "reason", "sabab", "سبب", "covid", "covid-19", "pcr", "test", "warning", "prevenir",
    "avertissement", "change", "changement", "effect", "effet", "difference", "help", "aide", "مساعده",
))
_FILLERS = frozenset((
    "a", "an", "the", "any", "my", "his", "her", "their", "your", "some", "real", "new", "further", "other", "recent",
    "significant", "major", "obvious", "particular", "more", "much", "had", "have", "has", "been", "felt",
    "experienced", "noticed", "sign", "signs", "symptom", "symptoms", "of", "de", "d'", "du", "des", "la", "le",
    "les", "l'", "un", "une", "mon", "mes", "sa", "son", "ses", "vraie", "vrai", "nouvelle", "nouveau", "autre",
    "grosse", "gros", "eu", "signe", "signes", "symptome", "symptomes", "notion", "thought", "thoughts", "idea",
    "ideas", "idee", "idees", "intention", "existence", "اي", "حتى", "وجود", "فكره", "افكار", "7ata", "hata", "7atta",
))
_MAX_FILLERS = 3
_PHRASE_TAIL = 3
_HISTORY = re.compile(
    r"\b(?:history of|hx of|h/o|past history|medical history|atcds?|antecedents?|pmh|anciens?|ancienne?s?|sequelles?|"
    r"(?:a|one|two|three|\d+) (?:years?|yrs?) ago|il y a (?:un|une|\d+) ans?|(?<!since )last (?:year|month)|"
    r"(?<!depuis )l'an (?:dernier|passe)|(?<!depuis )l'annee (?:derniere|passee)|(?<!depuis )le mois dernier|"
    r"depuis l'enfance|since childhood|since (?:19|20)\d\d|depuis (?:19|20)\d\d|depuis \d+ ans|for \d+ years|"
    r"(?:en|in) (?:19|20)\d\d|men \d+ (?:snin|3am)|men 3am|mel 3am|el 3am elli fet)\b|"
    r"(?<!\w)(?:سابقا|في الماضي|سوابق|العام الماضي|السنه الماضيه|الشهر الماضي|منذ سنه|منذ سنتين|منذ سنوات|"
    r"منذ \d+ (?:سنوات|سنين|سنه|عام|اعوام)|من عام|من سنه|العام اللي فات|العام الي فات|(?:عام|سنه) (?:19|20)\d\d)(?!\w)")
_HISTORY_REACH = 4  # tokens between a history marker and the match it suppresses (same clause)
_TOKEN = re.compile(r"\d+(?:[.,/]\d+)+|\b(?:[dljnstcm]|qu)'(?=\w)|[^\s.,;:!?،؛؟()\[\]{}\"«»]+|[.,;:!?،؛؟()\[\]{}\"«»]")
_PUNCT = frozenset(".,;:!?،؛؟()[]{}\"«»")
_ELDERLY_CLUE = re.compile(
    r"\b(?:elderly|old (?:man|woman|lady|gentleman)|grand(?:ma|pa|mother|father|dad|ad|ny|-mere|-pere|mere|pere)|gran|"
    r"granny|mamie|papi|papy|vieux|vieille|personne agee|aged? (?:7[5-9]|8\d|9\d)|"
    r"(?:7[5-9]|8\d|9\d) ?(?:y\.?o|yrs?|years?|ans?|f|m)|3ajouz|jedd|jedda|jeddi|(?:7[5-9]|8\d|9\d) (?:snin|sana))\b|"
    r"(?<!\w)[وف]?(?:عجوز|مسن|مسنه|كبير في السن|كبيره في السن|جدي|جدتي|جده|جدو)(?!\w)",
)


def _normalize(text: str) -> str:
    # Drop every combining mark (French accents, Arabic harakat/hamza marks); keywords get the same treatment.
    decomposed = unicodedata.normalize("NFKD", text.lower())
    kept = "".join(ch for ch in decomposed if not unicodedata.combining(ch)).translate(_ARABIC_VARIANTS)
    return re.sub(r"\s+", " ", kept).strip()


def _rule_text(text: str) -> str:
    """What the rules see: the model's normalisation plus curly apostrophes and Arabic-Indic digits."""
    return _normalize(text).replace("’", "'").translate(_DIGITS)


_CONNECTORS, _TERMINATORS, _STOPPERS, _FILLERS, _NEGATORS, _PRIVATIVE, _NEVER = (
    frozenset(_normalize(w) for w in ws)
    for ws in (_CONNECTORS, _TERMINATORS, _STOPPERS, _FILLERS, _NEGATORS, _PRIVATIVE, _NEVER))


class _Elderly:
    """A term of an "all" keyword that holds when the age field is 75+ or the text carries an elderly clue."""


def _literal(keyword: str) -> re.Pattern:
    """A string keyword as a whole-token pattern (see the note at the top of this section)."""
    stem = keyword.endswith("*")
    s = _normalize(keyword.rstrip("*"))
    body = re.escape(s)
    if _AR_LETTER.match(s[0]):
        left = r"(?<!\w)" + _AR_PRE
    else:
        left = r"(?<!\w)" if re.match(r"\w", s[0]) else ""
    if stem:
        right = ""
    elif _AR_LETTER.match(s[-1]):
        if s.endswith("ه"):  # ة: "سخانه" also takes "سخانتي"
            body = re.escape(s[:-1]) + "(?:ه|ت(?=[يهوكن]))"
        right = _AR_SUF + r"(?!\w)"
    else:
        right = r"(?!\w)" if re.match(r"\w", s[-1]) else ""
    return re.compile(left + body + right)


def _regex(rx: str) -> re.Pattern:
    """A regex keyword; "<<word>>" marks a whole Arabic token with its attached proclitics and suffixes."""
    return re.compile(rx.replace("<<", r"(?<!\w)" + _AR_PRE).replace(">>", _AR_SUF + r"(?!\w)"))


def _term(t):
    if isinstance(t, dict) and "regex" in t:
        return _regex(t["regex"])
    if isinstance(t, dict) and t.get("context") == "elderly":
        return _Elderly()
    return _literal(t)


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


class _Text:
    """One pass over the rule text: tokens, every keyword match, negation scopes and history markers."""

    def __init__(self, t: str, flags: list[dict]):
        self.t = t
        self.toks = [(m.start(), m.end(), m.group(0)) for m in _TOKEN.finditer(t)]
        self.starts = [a for a, _, _ in self.toks]
        self.words = [w.strip("'") if w not in ("d'", "l'", "n'") else w for _, _, w in self.toks]
        self.matches: dict[int, list[tuple[int, int]]] = {}
        kw_tokens: set[int] = set()
        self.reach: dict[int, int] = {}  # token where a keyword match starts -> last token that match covers
        for f in flags:
            for terms, _affirm in f["norm_keywords"]:
                for term in terms:
                    if isinstance(term, _Elderly) or id(term) in self.matches:
                        continue
                    spans = [m.span() for m in term.finditer(t)]
                    self.matches[id(term)] = spans
                    for a, b in spans:
                        ta = self.tok(a)
                        kw_tokens.add(ta)
                        self.reach[ta] = max(self.reach.get(ta, ta), self.tok(b - 1))
        cues = [(m.start(), m.end(), m.group(0).strip()) for m in _CUES.finditer(t)]
        self.cue_tokens = {self.next_tok(a) for a, _, _ in cues}
        self.governed = self._scopes(cues, kw_tokens)
        self.history = self._history()

    def tok(self, pos: int) -> int:
        """Index of the token holding (or nearest before) character `pos`."""
        return bisect_right(self.starts, pos) - 1

    def next_tok(self, pos: int) -> int:
        """Index of the first token starting at or after `pos`."""
        return bisect_right(self.starts, pos - 1)

    def _boundary(self, i: int) -> bool:
        return self.words[i] in _PUNCT or self.words[i] in _TERMINATORS

    def _cancelled(self, a: int, cue: str) -> bool:
        """A privative cue after a negation ("pas sans", "not without", "ما ... بلا") affirms; so does "never ... like
        this"; and a cue whose phrase opens with a privative cue is cancelled with it."""
        i = self.next_tok(a)
        if i > 0 and self.words[i - 1] in _STOPPERS:
            return True  # "ATCD aucun", "allergies: none": the cue denies the head before it, not what follows
        if cue in _PRIVATIVE:
            for j in range(i - 1, max(i - 4, -1), -1):
                if self.words[j] in _PUNCT:
                    break
                if self.words[j] in _NEGATORS:
                    return True
        if cue in _NEVER:
            end = min(len(self.toks), i + 12)
            k = i
            while k < end and self.words[k] not in (".", ";", "!", "?", "؛", "؟"):
                k += 1
            tail = self.t[self.toks[i][0]:self.toks[k - 1][1]] if i < k else ""
            if _AFFIRM_AFTER_NEVER.search(tail):
                return True
        return False

    def _scopes(self, cues: list[tuple[int, int, str]], kw_tokens: set[int]) -> set[int]:
        governed: set[int] = set()
        n = len(self.toks)
        for a, b, cue in cues:
            if self._cancelled(a, cue):
                continue
            i = self.next_tok(b)
            first = i
            # the first item: a cue opening on another privative cue ("not without") is void
            while first < n and self.words[first] in _FILLERS:
                first += 1
            if first < n and first in self.cue_tokens and _CUES.match(self.t, self.toks[first][0]) and \
                    _CUES.match(self.t, self.toks[first][0]).group(0).strip() in _PRIVATIVE:
                continue
            fillers, counted, extend_la, last = 0, 0, cue in ("لا", "la"), -1
            while i < n and i - self.next_tok(b) < 64:
                w = self.words[i]
                if w in _CONNECTORS or (extend_la and w == cue and counted):
                    fillers, counted = 0, 0
                    i += 1
                    continue
                if self._boundary(i) or (counted and i in self.cue_tokens):
                    break
                if counted == 0 and w in _FILLERS and fillers < _MAX_FILLERS:
                    governed.add(i)
                    fillers += 1
                    i += 1
                    continue
                if counted == 1 and ((i in kw_tokens and self.reach.get(last, last) < i)
                                     or (w.startswith("و") and len(w) > 2)):
                    break  # another keyword (or an Arabic "and ...") starts: a new statement
                governed.add(i)
                counted += 1
                last = i
                if w in _STOPPERS:
                    break
                if counted == 2:
                    # an enumeration continues the scope: "no fever, cough or chest pain" stops at the comma, but
                    # "no pain in the chest or shortness of breath" goes on through "or" (the rest of the first noun
                    # phrase, up to _PHRASE_TAIL tokens, is governed too)
                    k = i + 1
                    while (k < n and k <= i + _PHRASE_TAIL and not self._boundary(k)
                           and self.words[k] not in _CONNECTORS and k not in self.cue_tokens):
                        k += 1
                    if k < n and self.words[k] in _CONNECTORS:
                        governed.update(range(i + 1, k))
                        i = k
                        continue
                    break
                i += 1
        return governed

    def _history(self) -> list[tuple[int, int]]:
        """(token index, clause id) of each history marker that is not itself negated ("no history of", "ATCD aucun")."""
        out = []
        clause, clause_of = 0, []
        for i in range(len(self.toks)):
            if self._boundary(i):
                clause += 1
            clause_of.append(clause)
        self.clause_of = clause_of
        for m in _HISTORY.finditer(self.t):
            first, last = self.next_tok(m.start()), self.tok(m.end() - 1)
            near = [j for j in (first - 1, first - 2, last + 1, last + 2) if 0 <= j < len(self.toks)]
            if any(j in self.cue_tokens for j in near if j < first and clause_of[j] == clause_of[first]) or \
                    (last + 1 < len(self.toks) and self.words[last + 1] in _PUNCT and last + 2 < len(self.toks)
                     and last + 2 in self.cue_tokens) or (last + 1 in self.cue_tokens):
                continue
            out.append((first, last))
        return out

    def in_history(self, a: int, b: int) -> bool:
        """The match [a, b) sits in the same clause as a live history marker, at most _HISTORY_REACH tokens away."""
        if not self.history or not self.toks:
            return False
        ma, mb = self.tok(a), self.tok(max(a, b - 1))
        for ha, hb in self.history:
            if hb < ma:
                gap, lo, hi = ma - hb, hb, ma
            elif ha > mb:
                gap, lo, hi = ha - mb, mb, ha
            else:
                return True
            if gap <= _HISTORY_REACH and self.clause_of[lo] == self.clause_of[hi]:
                return True
        return False

    def live(self, term, age: int | None, ignore_negation: bool, ignore_history: bool = False) -> bool:
        """The term is present outside past history and, unless negation is ignored, at least one occurrence starts
        outside every negation scope."""
        if isinstance(term, _Elderly):
            return (age or 0) >= ELDERLY_AGE or bool(_ELDERLY_CLUE.search(self.t))
        for a, b in self.matches[id(term)]:
            if not ignore_history and self.in_history(a, b):
                continue
            if ignore_negation or self.tok(a) not in self.governed:
                return True
        return False


def model_text(text: str) -> str:
    """The triage classifier's input: the full text with the rule normalisation. Denials stay in, so the model reads
    "pas de fièvre et il a perdu connaissance" whole; the rules alone decide what a negation suppresses."""
    return _rule_text(text)


def scan_rules(flags: list[dict], text: str, age: int | None = None) -> tuple[list[dict], list[dict]]:
    """(flags that apply, flags whose wording is present only inside a negation or past history)."""
    s = _Text(_rule_text(text), flags)
    applied, negated = [], []
    for f in flags:
        for terms, affirm in f["norm_keywords"]:
            if all(s.live(x, age, affirm) for x in terms):
                applied.append(f)
                break
        else:
            if any(all(s.live(x, age, True, True) for x in terms) for terms, _ in f["norm_keywords"]):
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
    full_text = " ".join([referral_text, *symptoms])[:MAX_TEXT]
    matched, negated = _scan(full_text, age)
    flag_ids = [f["id"] for f in matched]
    floor = max((f["min_urgency"] for f in matched), default=1)
    reasons = [f"Red flag: {i.replace('_', ' ')} (urgency at least {f['min_urgency']})"
               for i, f in zip(flag_ids, matched)]
    reasons += [f"Red-flag wording denied or past history, not applied: {f['id'].replace('_', ' ')}"
                for f in negated]

    urgency, model_u, conf = floor, None, None
    model = textclf.load("triage.v2")
    if sum(ch.isalpha() for ch in _rule_text(full_text)) < MIN_LETTERS:
        # nothing a person or a model could read: neither routine nor urgent, a person looks at it
        urgency = max(urgency, 3)
        reasons.append(NOT_UNDERSTOOD)
    elif model is not None:
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
