"""Optional Laya intent classifier. Returns None whenever Laya is off, missing or failing."""

import json
import logging
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import get_settings

log = logging.getLogger(__name__)

_AI = Path(__file__).parent
HEAD = _AI / "models" / "laya_intent_head.safetensors"
QUESTION = json.loads((_AI / "rules" / "intents.v1.json").read_text(encoding="utf-8"))["question"]
KEYS = list(QUESTION["criteria"])
BASE_REPO, BASE_SUBFOLDER = "convaiinnovations/laya", "multilingual"


@lru_cache(maxsize=1)
def _load_agent() -> Any:
    """Load once per process; returns None (and logs once) when unavailable."""
    try:
        import laya
        from huggingface_hub import snapshot_download

        root = snapshot_download(BASE_REPO, allow_patterns=[f"{BASE_SUBFOLDER}/*"])
        agent = laya.load(f"{root}/{BASE_SUBFOLDER}", device="cpu")
        if HEAD.exists():
            from safetensors.torch import load_file

            params = dict(agent.model.named_parameters())
            head = {k: (v.to(params[k].dtype) if k in params else v) for k, v in load_file(str(HEAD)).items()}
            agent.model.load_state_dict(head, strict=False)
        return agent
    except Exception as exc:  # ImportError, download or load failure
        log.warning("Laya intent classifier unavailable: %s", exc)
        return None


_preloading = threading.Event()


def preload() -> None:
    """Warm Laya at startup (main.py runs this on a background thread)."""
    if get_settings().laya_enabled:
        _preloading.set()
        _load_agent()


def _still_loading() -> bool:
    return _preloading.is_set() and _load_agent.cache_info().currsize == 0


def classify(question: str) -> dict[str, float] | None:
    if not get_settings().laya_enabled:
        return None
    if _still_loading():  # never make a patient wait ~50 s for the first load; the other models answer
        return None
    agent = _load_agent()
    if agent is None:
        return None
    try:
        ans = agent.predict({"body": question}, {"intent": QUESTION})["answers"]["intent"]
        probs = ans.get("probabilities")
        if probs:
            out = {k: float(probs.get(k, 0.0)) for k in KEYS}
        else:
            choice, conf = ans["choice"], float(ans["confidence"])
            rest = (1.0 - conf) / (len(KEYS) - 1)
            out = {k: (conf if k == choice else rest) for k in KEYS}
        total = sum(out.values())
        return {k: v / total for k, v in out.items()} if total > 0 else None
    except Exception as exc:
        log.warning("Laya intent prediction failed: %s", exc)
        return None
