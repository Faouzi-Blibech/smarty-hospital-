"""Fine-tune Laya (Convai, Apache 2.0) on the patient-assistant intents (owner: Faouzi).

    pip install -r requirements-laya.txt
    python -m app.ai.training.make_data
    python -m app.ai.training.finetune_laya          # ~10 min on a laptop CPU

The multilingual encoder (mmBERT, 307M parameters) stays frozen; only Laya's decision head (about 15M parameters)
is trained. So the repo ships only the head, in fp16 (`models/laya_intent_head.safetensors`), and the base weights
come from the Hub on first use. The script prints accuracy on the hand-written `intent_eval.v1.jsonl` for the base
model and the fine-tuned one, and writes both to `models/laya_intent_metrics.json`.
"""

import json
import os
import tempfile
import time
from pathlib import Path

os.environ.setdefault("USE_TF", "0")

AI = Path(__file__).resolve().parent.parent
DATA, MODELS = AI / "data", AI / "models"
HEAD = MODELS / "laya_intent_head.safetensors"
METRICS = MODELS / "laya_intent_metrics.json"
BASE_REPO, BASE_SUBFOLDER = "convaiinnovations/laya", "multilingual"


def base_dir() -> str:
    from huggingface_hub import snapshot_download

    root = snapshot_download(BASE_REPO, allow_patterns=[f"{BASE_SUBFOLDER}/*"])
    return os.path.join(root, BASE_SUBFOLDER)


def evaluate(agent, question: dict) -> dict:
    rows = [json.loads(line) for line in (DATA / "intent_eval.v1.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()]
    hits, misses, times = 0, [], []
    for r in rows:
        t0 = time.perf_counter()
        got = agent.predict({"body": r["text"]}, {"intent": question})["answers"]["intent"]["choice"]
        times.append((time.perf_counter() - t0) * 1000)
        if got == r["intent"]:
            hits += 1
        else:
            misses.append({"text": r["text"], "expected": r["intent"], "got": got})
    times.sort()
    return {"accuracy": round(hits / len(rows), 3), "n": len(rows), "median_ms": round(times[len(times) // 2]),
            "misses": misses}


def main() -> None:
    import laya
    from safetensors.torch import load_file, save_file
    from laya.train import TrainConfig, finetune

    from app.ai.training.make_data import INTENT_QUESTION

    src = base_dir()
    base = evaluate(laya.load(src, device="cpu"), INTENT_QUESTION)
    print("base:", {k: v for k, v in base.items() if k != "misses"}, flush=True)

    with tempfile.TemporaryDirectory() as out:
        cfg = TrainConfig(epochs=4, micro_batch=8, grad_accum=2, freeze_encoder=True, loss="soft-ce",
                          shuffle_options=("choice",), calib_frac=0.0, log_every=10)
        summary = finetune(str(DATA / "intent_train.v1.jsonl"), src, out, config=cfg, device="cpu")
        print("train:", {"items": summary["train_items"], "epoch_loss": summary["epoch_loss"]}, flush=True)
        tuned = evaluate(laya.load(out, device="cpu"), INTENT_QUESTION)
        print("fine-tuned:", {k: v for k, v in tuned.items() if k != "misses"}, flush=True)
        head = {k: v.contiguous() for k, v in load_file(os.path.join(out, "model.safetensors")).items()
                if not k.startswith("encoder.")}

    MODELS.mkdir(exist_ok=True)
    save_file(head, str(HEAD), metadata={"base": f"{BASE_REPO}/{BASE_SUBFOLDER}", "data": "intent_train.v1.jsonl"})
    METRICS.write_text(json.dumps({"base": base, "fine_tuned": tuned, "train_items": summary["train_items"],
                                   "epoch_loss": summary["epoch_loss"]}, ensure_ascii=False, indent=2) + "\n",
                       encoding="utf-8")
    print(f"wrote {HEAD.name} ({HEAD.stat().st_size / 1e6:.1f} MB) and {METRICS.name}")


if __name__ == "__main__":
    main()
