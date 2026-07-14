"""Data-driven evaluation of the Agent-1 same-instance backbone on real fashion photos.

Purpose: replace assumption-tuned thresholds (3 fixtures) with numbers measured on a public dataset.
Uses Marqo/deepfashion-inshop (In-shop retrieval): each item_ID's front/side/back poses are the SAME
physical garment — a faithful proxy for "seller catalog shot vs buyer live photo". Same (gender,
category) but different item = the HARD negative the fixtures never had (two different dresses).

For every candidate config (model × input-representation × pooling) we measure, on identical pairs:
  ROC-AUC(positive=same-instance vs negative=same-category-different-instance)
  TAR@FAR   the True-Accept Rate (recall of genuine same-item) at a fixed False-Accept Rate — the
            operating point that matters for a possession gate (a false accept passes a WRONG item;
            a false reject only asks the seller to retake).

Head-to-head: DINOv2 (ONNX, natural crop) vs the incumbent CLIP ViT-B/32 (zeroed crop, its pipeline
config). Writes the winning config + thresholds to models/calibration_dinov2.json.

Run (export venv has torch+transformers for the CLIP baseline AND onnxruntime for DINOv2):
    .venv-export/bin/python scripts/eval_matcher.py --instances 150 --seed 0
"""
from __future__ import annotations

import argparse
import io
import json
import pickle
import re
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import segment  # noqa: E402  (repo module)

PARQUET = "datasets/Marqo/deepfashion-inshop/data/data-00000-of-00001.parquet"
CAL_OUT = ROOT / "models" / "calibration_dinov2.json"

# instance key: strip the trailing pose tokens "_<idx>_<view>" from item_ID
#   MEN_Denim_id_00000080_01_1_front → MEN_Denim_id_00000080_01
_POSE_RE = re.compile(r"_\d+_[a-z]+$", re.IGNORECASE)


def instance_key(item_id: str) -> str:
    return _POSE_RE.sub("", item_id)


# ─────────────────────────── data loading ────────────────────────────────────
def load_items(n_instances: int, seed: int):
    """Read spread-out row groups until we have n_instances items with ≥2 images.

    Returns list of records {img_bytes, instance, cat} — cat = (category1, category2).
    """
    import pyarrow.parquet as pq
    from huggingface_hub import HfFileSystem

    import random

    fs = HfFileSystem()
    pf = pq.ParquetFile(fs.open(PARQUET))
    n_groups = pf.num_row_groups
    # The file is sorted by category, so a contiguous read clusters into one category. Shuffle the
    # row-group visitation order (seeded) so the sample spans many categories → representative eval.
    order = list(range(n_groups))
    random.Random(seed).shuffle(order)

    by_instance: dict[str, list] = defaultdict(list)
    cols = ["image", "category1", "category2", "color", "item_ID"]
    for gi in order:
        tbl = pf.read_row_group(gi, columns=cols).to_pydict()
        for img, c1, c2, col, iid in zip(
            tbl["image"], tbl["category1"], tbl["category2"], tbl["color"], tbl["item_ID"]
        ):
            key = instance_key(iid)
            by_instance[key].append(
                {"img_bytes": img["bytes"], "cat": (c1, c2), "color": (col or "").strip().lower()})
        enough = sum(1 for v in by_instance.values() if len(v) >= 2)
        if enough >= n_instances:
            break
    # keep only instances with ≥2 images
    kept = {k: v for k, v in by_instance.items() if len(v) >= 2}
    print(f"loaded {len(kept)} instances (≥2 imgs) spanning "
          f"{len({r['cat'] for v in kept.values() for r in v})} categories", flush=True)
    return kept


# ─────────────────────────── pair sampling ───────────────────────────────────
def build_pairs(kept: dict, seed: int, pairs_per_instance: int = 2):
    """Build positives + two negative flavours.

    positives     same instance, different pose (catalog-vs-live analog).
    neg_semantic  same category2, different instance (may look different) — CLIP's job to reject.
    neg_hard      same category2 AND same colour, different instance (the LOOK-ALIKE substitution) —
                  the adversarial case, DINOv2's job to reject.
    """
    import random

    rng = random.Random(seed)
    images: list[bytes] = []
    inst_imgs: dict[str, list[int]] = {}
    cat_insts: dict[tuple, list[str]] = defaultdict(list)
    catcol_insts: dict[tuple, list[str]] = defaultdict(list)
    for key, recs in kept.items():
        idxs = []
        for r in recs:
            idxs.append(len(images))
            images.append(r["img_bytes"])
        inst_imgs[key] = idxs
        cat_insts[recs[0]["cat"]].append(key)
        catcol_insts[(recs[0]["cat"], recs[0]["color"])].append(key)

    positives: list[tuple[int, int]] = []
    for key, idxs in inst_imgs.items():
        for _ in range(min(pairs_per_instance, len(idxs) - 1)):
            a, b = rng.sample(idxs, 2)
            positives.append((a, b))

    def sample_negs(groups: dict, target: int):
        keys = [g for g, ks in groups.items() if len(ks) >= 2]
        out: list[tuple[int, int]] = []
        guard = 0
        while len(out) < target and guard < target * 200:
            guard += 1
            g = rng.choice(keys)
            k1, k2 = rng.sample(groups[g], 2)
            out.append((rng.choice(inst_imgs[k1]), rng.choice(inst_imgs[k2])))
        return out

    neg_semantic = sample_negs(cat_insts, len(positives))
    neg_hard = sample_negs(catcol_insts, len(positives))

    used = sorted({i for p in positives + neg_semantic + neg_hard for i in p})
    print(f"pairs: {len(positives)} positive, {len(neg_semantic)} semantic-neg, "
          f"{len(neg_hard)} hard-neg (same cat+colour); {len(used)} unique images to embed",
          flush=True)
    return images, positives, neg_semantic, neg_hard, used


# ─────────────────────────── embedding backends ──────────────────────────────
def dino_descriptors(img_bytes: bytes):
    """Return dict repr→pooling→unit-vector for DINOv2 (one forward pass per representation)."""
    import dino_embed

    def poolings(seq):
        a = np.asarray(seq, dtype=np.float64)[0]  # (1+P, D)
        cls, mean = a[0], a[1:].mean(axis=0)
        l2 = lambda v: v / (np.linalg.norm(v) or 1.0)
        return {"cls": l2(cls), "mean": l2(mean),
                "cls_mean": l2(np.concatenate([l2(cls), l2(mean)]))}

    dino_embed._load()
    sess, iname, oname = dino_embed._session, dino_embed._input_name, dino_embed._output_name
    out = {}
    whole = dino_embed._preprocess(img_bytes)
    out["whole"] = poolings(sess.run([oname], {iname: whole})[0])
    crop = segment.segment_garment(img_bytes, zero_bg=False)["bytes"]  # natural crop for DINOv2
    out["crop"] = poolings(sess.run([oname], {iname: dino_embed._preprocess(crop)})[0])
    return out


class Clip:
    def __init__(self):
        import torch
        from transformers import CLIPModel, CLIPProcessor

        self.torch = torch
        self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").eval()
        self.proc = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

    def _embed(self, data: bytes) -> np.ndarray:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        inp = self.proc(images=img, return_tensors="pt")
        with self.torch.no_grad():
            v = self.model.vision_model(pixel_values=inp["pixel_values"])
            feat = self.model.visual_projection(v.pooler_output)[0].numpy().astype(np.float64)
        return feat / (np.linalg.norm(feat) or 1.0)

    def descriptors(self, img_bytes: bytes):
        crop = segment.segment_garment(img_bytes, zero_bg=True)["bytes"]  # zeroed crop = CLIP pipeline
        return {"whole": self._embed(img_bytes), "crop": self._embed(crop)}


# ─────────────────────────── metrics ─────────────────────────────────────────
def _cos(va, vb):
    return max(0.0, min(1.0, float(np.dot(va, vb))))


def auc_of(pos, neg):
    from sklearn.metrics import roc_auc_score
    y = np.concatenate([np.ones_like(pos), np.zeros_like(neg)])
    return float(roc_auc_score(y, np.concatenate([pos, neg])))


def and_gate_grid(cpos, cneg, dpos, dneg, far_target):
    """Grid-search (Tc, Td) for a CLIP∧DINOv2 gate: max TAR s.t. combined FAR ≤ far_target.

    cpos/cneg = CLIP scores, dpos/dneg = DINOv2 scores (neg = semantic ∪ hard). A pair PASSES only
    if clip ≥ Tc AND dino ≥ Td, so a false accept must beat BOTH bars — the look-alike (high CLIP,
    low DINOv2) is stopped by Td, the different-item (low CLIP) by Tc.
    """
    c_grid = np.quantile(cneg, np.linspace(0.5, 0.999, 40))
    d_grid = np.quantile(dneg, np.linspace(0.5, 0.999, 40))
    best = None
    for tc in c_grid:
        for td in d_grid:
            far = float(((cneg >= tc) & (dneg >= td)).mean())
            if far <= far_target:
                tar = float(((cpos >= tc) & (dpos >= td)).mean())
                if best is None or tar > best["tar"]:
                    best = {"Tc": round(float(tc), 4), "Td": round(float(td), 4),
                            "tar": round(tar, 4), "far": round(far, 4)}
    return best


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--instances", type=int, default=150)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--far", type=float, default=0.05, help="target false-accept rate for the gate")
    ap.add_argument("--reembed", action="store_true", help="ignore the on-disk embedding cache")
    args = ap.parse_args()

    # Embedding is the expensive step (GrabCut + two models on CPU). Cache descriptors + pairs to disk
    # keyed by (instances, seed) so threshold/metric iteration never re-embeds.
    # NOTE: pickle here is a self-produced, local dev-only cache — not untrusted input.
    cache_path = ROOT / "models" / f"eval_cache_i{args.instances}_s{args.seed}.pkl"
    if cache_path.exists() and not args.reembed:
        print(f"loading cached embeddings from {cache_path.name}", flush=True)
        blob = pickle.loads(cache_path.read_bytes())
        positives, neg_sem, neg_hard = blob["positives"], blob["neg_sem"], blob["neg_hard"]
        dino_cache, clip_cache, n_kept = blob["dino"], blob["clip"], blob["n_kept"]
    else:
        kept = load_items(args.instances, args.seed)
        n_kept = len(kept)
        images, positives, neg_sem, neg_hard, used = build_pairs(kept, args.seed)

        import dino_embed
        if not dino_embed.available():
            print("DINOv2 unavailable:", dino_embed.load_error())
            return
        clip = Clip()

        dino_cache: dict[int, dict] = {}
        clip_cache: dict[int, dict] = {}
        for n, i in enumerate(used):
            dino_cache[i] = dino_descriptors(images[i])
            clip_cache[i] = clip.descriptors(images[i])
            if (n + 1) % 100 == 0:
                print(f"embedded {n + 1}/{len(used)}", flush=True)
        print(f"embedded {len(used)}/{len(used)}", flush=True)
        cache_path.write_bytes(pickle.dumps(
            {"positives": positives, "neg_sem": neg_sem, "neg_hard": neg_hard,
             "dino": dino_cache, "clip": clip_cache, "n_kept": n_kept}))
        print(f"cached embeddings → {cache_path.name}", flush=True)

    def score(kind, pairs):
        """kind: 'clip/whole' | 'clip/crop' | 'clip/max' | 'dino/<repr>/<pool>' (repr∈whole,crop,max)."""
        parts = kind.split("/")
        out = []
        for a, b in pairs:
            if parts[0] == "clip":
                r = parts[1]
                if r == "max":
                    s = max(_cos(clip_cache[a]["whole"], clip_cache[b]["whole"]),
                            _cos(clip_cache[a]["crop"], clip_cache[b]["crop"]))
                else:
                    s = _cos(clip_cache[a][r], clip_cache[b][r])
            else:
                r, p = parts[1], parts[2]
                if r == "max":
                    s = max(_cos(dino_cache[a]["whole"][p], dino_cache[b]["whole"][p]),
                            _cos(dino_cache[a]["crop"][p], dino_cache[b]["crop"][p]))
                else:
                    s = _cos(dino_cache[a][r][p], dino_cache[b][r][p])
            out.append(s)
        return np.asarray(out)

    # Per-signal AUC on the two negative regimes — shows the complementarity (CLIP strong on semantic,
    # DINOv2 relatively stronger on look-alikes).
    clip_sigs = ["clip/whole", "clip/crop", "clip/max"]
    dino_sigs = [f"dino/{r}/{p}" for r in ("whole", "crop", "max") for p in ("cls", "cls_mean")]
    print("\n=== per-signal ROC-AUC ===")
    print(f"{'signal':22s} {'AUC(semantic)':>14} {'AUC(hard=cat+colour)':>22}")
    per_signal = {}
    for kind in clip_sigs + dino_sigs:
        p = score(kind, positives)
        a_sem = auc_of(p, score(kind, neg_sem))
        a_hard = auc_of(p, score(kind, neg_hard))
        per_signal[kind] = {"auc_semantic": round(a_sem, 4), "auc_hard": round(a_hard, 4)}
        print(f"{kind:22s} {a_sem:>14.4f} {a_hard:>22.4f}")

    # AND-gate calibration: choose the (CLIP signal, DINOv2 signal) pair whose joint gate gives the
    # best TAR at the target FAR over the COMBINED negatives (semantic ∪ hard).
    neg_all = neg_sem + neg_hard
    print(f"\n=== CLIP∧DINOv2 AND-gate @ FAR≤{args.far:.0%} (neg = semantic ∪ hard) ===")
    print(f"{'clip_sig × dino_sig':40s} {'TAR':>7} {'Tc':>7} {'Td':>7}")
    gate_results = []
    for cs in ("clip/whole", "clip/max"):
        cpos, cneg = score(cs, positives), score(cs, neg_all)
        for ds in ("dino/max/cls", "dino/crop/cls", "dino/max/cls_mean"):
            dpos, dneg = score(ds, positives), score(ds, neg_all)
            g = and_gate_grid(cpos, cneg, dpos, dneg, args.far)
            if g:
                gate_results.append((cs, ds, g))
                print(f"{cs + ' × ' + ds:40s} {g['tar']:>7.3f} {g['Tc']:>7.3f} {g['Td']:>7.3f}")

    gate_results.sort(key=lambda r: r[2]["tar"], reverse=True)
    best = gate_results[0] if gate_results else None
    artifact = {
        "dataset": "Marqo/deepfashion-inshop",
        "n_instances": n_kept, "n_pos": len(positives),
        "n_neg_semantic": len(neg_sem), "n_neg_hard": len(neg_hard),
        "seed": args.seed, "far_target": args.far,
        "per_signal": per_signal,
        "and_gate_best": None if not best else {
            "clip_signal": best[0], "dino_signal": best[1], **best[2]},
        "and_gate_all": [{"clip": c, "dino": d, **g} for c, d, g in gate_results],
    }
    CAL_OUT.write_text(json.dumps(artifact, indent=2))
    if best:
        print(f"\nBEST GATE: {best[0]} ∧ {best[1]}  →  TAR={best[2]['tar']:.3f} "
              f"@ FAR={best[2]['far']:.3f}  (Tc={best[2]['Tc']}, Td={best[2]['Td']})")
    print(f"wrote {CAL_OUT}")


if __name__ == "__main__":
    main()
