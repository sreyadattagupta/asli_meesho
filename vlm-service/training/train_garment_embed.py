"""Fine-tune DINOv2-small into a garment same-INSTANCE matcher (Agent-1 root fix).

Run on a GPU (Colab T4/A100 or any CUDA box) — NOT on the CPU serving container:

    pip install -r training/requirements-train.txt
    python training/train_garment_embed.py --epochs 6 --instances 1200 \
        --push-repo dsreya/garment-dinov2   # optional: push ONNX + calibration to the Hub

WHAT / WHY
The generic embeddings cluster by semantic category, so a GENUINE garment shown very differently
(on-model studio catalog vs flat-lay live) can score below the same-item bar (measured: a real
green-tee pair scored SigLIP 0.735 vs a 0.75 bar). We fine-tune with METRIC LEARNING on the exact
signal we need:
  * POSITIVE   = same instance, different pose (DeepFashion In-shop item_ID front/side/back) —
                 the catalog-vs-live analogue.
  * HARD NEG   = same (category, colour), different instance — the look-alike the repo's own eval
                 says NO off-the-shelf embedding separates (all AUC 0.53–0.67). Fine-tuning on these
                 is the whole point: teach the space to pull same-instance together and push
                 same-look different-item apart.
Supervised-contrastive loss over L2-normalised cls_mean-pooled DINOv2 features. We optimise the SAME
pooled descriptor the serving path computes (garment_embed._pool cls_mean) so train == serve.

OUTPUT
  models/garment-dinov2/model.onnx            (served by garment_embed.py, onnxruntime, no torch)
  models/garment_calibration.json             (AUC + chosen same-item threshold on a held-out split)
Optionally pushed to the HF Hub (Apache-2.0 backbone; declare in ATTRIBUTION.md).

Dataset: Marqo/deepfashion-inshop (same set the incumbent gate was calibrated on — apples-to-apples).
"""
from __future__ import annotations

import argparse
import io
import json
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MODEL_ID = "facebook/dinov2-small"
OUT_DIR = ROOT / "models" / "garment-dinov2"
CAL_OUT = ROOT / "models" / "garment_calibration.json"

# instance key: strip the trailing pose tokens "_<idx>_<view>" (same rule as scripts/eval_matcher.py)
_POSE_RE = re.compile(r"_\d+_[a-z]+$", re.IGNORECASE)

# DINOv2 preprocessing constants — MUST match garment_embed._preprocess exactly.
_RESIZE_SHORTEST, _CROP = 256, 224
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def instance_key(item_id: str) -> str:
    return _POSE_RE.sub("", item_id)


# ─────────────────────────── data ────────────────────────────────────────────
def load_instances(n_instances: int, seed: int):
    """Read spread-out row groups until we have n_instances items with ≥2 images.

    Returns {instance_key: [ {bytes, cat:(c1,c2), color} ]} — mirrors scripts/eval_matcher.load_items.
    """
    import random

    import pyarrow.parquet as pq
    from huggingface_hub import HfFileSystem

    parquet = "datasets/Marqo/deepfashion-inshop/data/data-00000-of-00001.parquet"
    fs = HfFileSystem()
    pf = pq.ParquetFile(fs.open(parquet))
    order = list(range(pf.num_row_groups))
    random.Random(seed).shuffle(order)  # file is category-sorted → shuffle groups for a broad sample

    by_instance: dict[str, list] = defaultdict(list)
    cols = ["image", "category1", "category2", "color", "item_ID"]
    for gi in order:
        tbl = pf.read_row_group(gi, columns=cols).to_pydict()
        for img, c1, c2, col, iid in zip(
            tbl["image"], tbl["category1"], tbl["category2"], tbl["color"], tbl["item_ID"]
        ):
            by_instance[instance_key(iid)].append(
                {"bytes": img["bytes"], "cat": (c1, c2), "color": (col or "").strip().lower()})
        if sum(1 for v in by_instance.values() if len(v) >= 2) >= n_instances:
            break
    kept = {k: v for k, v in by_instance.items() if len(v) >= 2}
    print(f"loaded {len(kept)} instances (≥2 imgs) spanning "
          f"{len({r['cat'] for v in kept.values() for r in v})} categories", flush=True)
    return kept


def _preprocess(data: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    scale = _RESIZE_SHORTEST / min(w, h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BICUBIC)
    w2, h2 = img.size
    left, top = (w2 - _CROP) // 2, (h2 - _CROP) // 2
    img = img.crop((left, top, left + _CROP, top + _CROP))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - _MEAN) / _STD
    return np.ascontiguousarray(np.transpose(arr, (2, 0, 1)), dtype=np.float32)


class PKSampler:
    """Yield batches of P instances × K images. Same-(cat,colour) instances are grouped so a batch
    frequently contains LOOK-ALIKE hard negatives (same cat+colour, different instance)."""

    def __init__(self, kept: dict, p: int, k: int, seed: int, hard_frac: float = 0.5):
        import random

        self.rng = random.Random(seed)
        self.keys = list(kept.keys())
        self.kept = kept
        self.p, self.k, self.hard_frac = p, k, hard_frac
        self.by_catcol: dict[tuple, list[str]] = defaultdict(list)
        for key, recs in kept.items():
            self.by_catcol[(recs[0]["cat"], recs[0]["color"])].append(key)
        self.hard_groups = [g for g, ks in self.by_catcol.items() if len(ks) >= 2]

    def batch(self):
        chosen: list[str] = []
        # Half the instances from a single look-alike group (hard negatives), half random (diversity).
        if self.hard_groups and self.rng.random() < self.hard_frac:
            g = self.rng.choice(self.hard_groups)
            pool = self.by_catcol[g]
            chosen += self.rng.sample(pool, min(self.p, len(pool)))
        while len(chosen) < self.p:
            k = self.rng.choice(self.keys)
            if k not in chosen:
                chosen.append(k)
        xs, labels = [], []
        for li, key in enumerate(chosen):
            recs = self.kept[key]
            picks = (self.rng.sample(recs, self.k) if len(recs) >= self.k
                     else [self.rng.choice(recs) for _ in range(self.k)])
            for r in picks:
                xs.append(_preprocess(r["bytes"]))
                labels.append(li)
        return np.stack(xs), np.asarray(labels, dtype=np.int64)


# ─────────────────────────── model ───────────────────────────────────────────
def pooled_features(backbone, pixel_values):
    """cls_mean pooling of DINOv2 last_hidden_state, L2-normalised — identical to garment_embed._pool."""
    import torch.nn.functional as F

    seq = backbone(pixel_values=pixel_values).last_hidden_state  # (B, 1+P, D)
    cls = F.normalize(seq[:, 0], dim=-1)
    mean = F.normalize(seq[:, 1:].mean(dim=1), dim=-1)
    return F.normalize(__import__("torch").cat([cls, mean], dim=-1), dim=-1)  # (B, 2D)


def supcon_loss(emb, labels, temperature: float = 0.1):
    """Supervised contrastive loss (Khosla et al. 2020) over L2-normalised embeddings."""
    import torch

    device = emb.device
    sim = emb @ emb.t() / temperature
    sim = sim - sim.max(dim=1, keepdim=True).values.detach()  # numerical stability
    labels = labels.view(-1, 1)
    pos_mask = (labels == labels.t()).float().to(device)
    self_mask = torch.eye(pos_mask.size(0), device=device)
    pos_mask = pos_mask - self_mask                      # exclude self
    exp = torch.exp(sim) * (1 - self_mask)               # exclude self from denominator
    log_prob = sim - torch.log(exp.sum(dim=1, keepdim=True) + 1e-12)
    pos_per = pos_mask.sum(dim=1)
    valid = pos_per > 0
    loss = -(pos_mask * log_prob).sum(dim=1)[valid] / pos_per[valid]
    return loss.mean()


# ─────────────────────────── eval (reuses eval_matcher's metric idea) ─────────
def evaluate(backbone, kept_eval: dict, seed: int):
    """AUC(same-instance vs same-cat+colour look-alike) + a recall-leaning threshold, on held-out
    instances. Metric mirrors scripts/eval_matcher (positives = same instance diff pose;
    neg_hard = same cat+colour diff instance)."""
    import random

    import torch
    from sklearn.metrics import roc_auc_score

    backbone.eval()
    device = next(backbone.parameters()).device
    rng = random.Random(seed)

    # Embed one representative-heavy sample per instance.
    keys = list(kept_eval.keys())
    emb_by_key: dict[str, list[np.ndarray]] = {}
    with torch.no_grad():
        for key in keys:
            xs = np.stack([_preprocess(r["bytes"]) for r in kept_eval[key][:3]])
            v = pooled_features(backbone, torch.from_numpy(xs).to(device)).cpu().numpy()
            emb_by_key[key] = list(v)

    by_catcol: dict[tuple, list[str]] = defaultdict(list)
    for key in keys:
        r0 = kept_eval[key][0]
        by_catcol[(r0["cat"], r0["color"])].append(key)
    hard_groups = [g for g, ks in by_catcol.items() if len(ks) >= 2]

    def cos(a, b):
        return float(max(0.0, min(1.0, float(np.dot(a, b)))))

    pos, neg = [], []
    for key, vs in emb_by_key.items():
        if len(vs) >= 2:
            pos.append(cos(vs[0], vs[1]))
    for _ in range(len(pos)):
        g = rng.choice(hard_groups)
        k1, k2 = rng.sample(by_catcol[g], 2)
        neg.append(cos(emb_by_key[k1][0], emb_by_key[k2][0]))
    pos, neg = np.asarray(pos), np.asarray(neg)
    y = np.concatenate([np.ones_like(pos), np.zeros_like(neg)])
    auc = float(roc_auc_score(y, np.concatenate([pos, neg])))
    # Recall-leaning threshold: the 95th percentile of hard negatives (≈5% false-accept on look-alikes).
    thr = float(np.quantile(neg, 0.95)) if len(neg) else 0.5
    tar = float((pos >= thr).mean()) if len(pos) else 0.0
    backbone.train()
    return {"auc_hard": round(auc, 4), "threshold": round(thr, 4), "tar_at_far5": round(tar, 4),
            "n_pos": len(pos), "n_neg_hard": len(neg),
            "pos_mean": round(float(pos.mean()), 4) if len(pos) else None,
            "neg_mean": round(float(neg.mean()), 4) if len(neg) else None}


# ─────────────────────────── export ──────────────────────────────────────────
def export_onnx(backbone):
    """Export the fine-tuned backbone to last_hidden_state ONNX (same shape contract as
    scripts/export_dinov2_onnx.py, so garment_embed.py serves it unchanged).

    Robust by design: (1) the live backbone is NEVER moved off its device — we export a CPU DEEPCOPY,
    so training continues on GPU afterwards; (2) the weights are saved to pytorch_model.bin FIRST so a
    good epoch is never lost to an export hiccup; (3) the TorchScript exporter is forced (dynamo=False)
    to avoid the newer dynamo path that requires the optional `onnxscript` package, with a kwarg
    fallback for older torch.
    """
    import copy

    import torch

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # (2) persist weights first — a trained epoch survives even if ONNX export fails.
    torch.save(backbone.state_dict(), OUT_DIR / "pytorch_model.bin")

    class SeqEmbedder(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, pixel_values):
            return self.m(pixel_values=pixel_values).last_hidden_state

    # (1) export a CPU copy; the original stays on GPU in train mode for the next epoch.
    wrapper = SeqEmbedder(copy.deepcopy(backbone)).eval().cpu()
    dummy = torch.randn(1, 3, 224, 224)
    onnx_path = OUT_DIR / "model.onnx"
    kw = dict(input_names=["pixel_values"], output_names=["last_hidden_state"],
              dynamic_axes={"pixel_values": {0: "batch"}, "last_hidden_state": {0: "batch"}},
              opset_version=17, do_constant_folding=True)
    with torch.no_grad():
        try:
            torch.onnx.export(wrapper, (dummy,), str(onnx_path), dynamo=False, **kw)  # (3) TorchScript path
        except TypeError:  # older torch has no `dynamo` kwarg — its default is already TorchScript
            torch.onnx.export(wrapper, (dummy,), str(onnx_path), **kw)
    print(f"exported → {onnx_path}  ({onnx_path.stat().st_size / 1e6:.1f} MB)", flush=True)
    return onnx_path


def push_to_hub(repo: str, onnx_path: Path):
    from huggingface_hub import HfApi

    api = HfApi()
    api.create_repo(repo, repo_type="model", exist_ok=True)
    api.upload_file(path_or_fileobj=str(onnx_path), path_in_repo="model.onnx",
                    repo_id=repo, repo_type="model")
    if CAL_OUT.exists():
        api.upload_file(path_or_fileobj=str(CAL_OUT), path_in_repo="garment_calibration.json",
                        repo_id=repo, repo_type="model")
    print(f"pushed model.onnx + calibration → https://huggingface.co/{repo}", flush=True)


# ─────────────────────────── train loop ──────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--instances", type=int, default=1200)
    ap.add_argument("--steps-per-epoch", type=int, default=200)
    ap.add_argument("--p", type=int, default=8, help="instances per batch")
    ap.add_argument("--k", type=int, default=4, help="images per instance")
    ap.add_argument("--lr", type=float, default=1e-5)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--eval-frac", type=float, default=0.15)
    ap.add_argument("--push-repo", type=str, default="", help="HF repo to push ONNX + calibration to")
    args = ap.parse_args()

    import random

    import torch
    from transformers import AutoModel

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("WARNING: no CUDA — DINOv2 fine-tuning on CPU is impractically slow. Use a GPU.", flush=True)

    kept = load_instances(args.instances, args.seed)
    keys = list(kept.keys())
    random.Random(args.seed).shuffle(keys)
    n_eval = max(20, int(len(keys) * args.eval_frac))
    eval_keys, train_keys = set(keys[:n_eval]), keys[n_eval:]
    kept_train = {k: kept[k] for k in train_keys}
    kept_eval = {k: kept[k] for k in eval_keys}
    print(f"split: {len(kept_train)} train / {len(kept_eval)} eval instances", flush=True)

    backbone = AutoModel.from_pretrained(MODEL_ID).to(device).train()
    opt = torch.optim.AdamW(backbone.parameters(), lr=args.lr, weight_decay=1e-4)
    sampler = PKSampler(kept_train, p=args.p, k=args.k, seed=args.seed)

    best = {"auc_hard": -1.0}
    base = evaluate(backbone, kept_eval, args.seed)
    print(f"baseline (pretrained DINOv2): {base}", flush=True)

    for epoch in range(args.epochs):
        run = 0.0
        for step in range(args.steps_per_epoch):
            xs, labels = sampler.batch()
            xs = torch.from_numpy(xs).to(device)
            labels = torch.from_numpy(labels).to(device)
            emb = pooled_features(backbone, xs)
            loss = supcon_loss(emb, labels)
            opt.zero_grad()
            loss.backward()
            opt.step()
            run += float(loss.item())
            if (step + 1) % 50 == 0:
                print(f"epoch {epoch} step {step + 1}/{args.steps_per_epoch} "
                      f"loss {run / (step + 1):.4f}", flush=True)
        metrics = evaluate(backbone, kept_eval, args.seed)
        print(f"epoch {epoch} eval: {metrics}", flush=True)
        if metrics["auc_hard"] > best["auc_hard"]:
            best = {**metrics, "epoch": epoch}
            export_onnx(backbone)
            CAL_OUT.write_text(json.dumps({
                "_comment": "Agent-1 fine-tuned garment same-instance matcher (garment_embed.py). "
                            "gate_threshold is the same-item PASS bar on the fine-tuned cosine.",
                "backbone": MODEL_ID, "pooling": "cls_mean",
                "dataset": "Marqo/deepfashion-inshop",
                "gate_signal": "garment/cls_mean", "gate_threshold": metrics["threshold"],
                "baseline_pretrained": base, "best": best,
            }, indent=2))
            print(f"  ↳ new best (auc_hard {best['auc_hard']}) — exported + wrote calibration", flush=True)

    print(f"\nBEST: {best}", flush=True)
    print(f"baseline→best AUC(hard look-alike): {base['auc_hard']} → {best['auc_hard']}", flush=True)
    if args.push_repo:
        push_to_hub(args.push_repo, OUT_DIR / "model.onnx")


if __name__ == "__main__":
    main()
