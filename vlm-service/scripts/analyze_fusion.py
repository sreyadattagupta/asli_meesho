"""Cache-based analysis: is CLIP+DINOv2 FUSION better than either backbone alone?

Loads the embedding cache written by eval_matcher.py (no re-embedding) and evaluates individual
signals plus simple, deployable fusions (mean / min / max of two cosines) and a logistic upper bound
(5-fold cross-validated, so the number is honest, not fit-on-test). Reports ROC-AUC and TAR@FAR on
the same positive/hard-negative pairs.

    .venv-export/bin/python scripts/analyze_fusion.py --instances 160 --seed 0
"""
from __future__ import annotations

import argparse
import pickle
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent


def _cos(a, b):
    return max(0.0, min(1.0, float(np.dot(a, b))))


def tar_at_far(pos, neg, far):
    thr = float(np.quantile(neg, 1.0 - far))
    return float((pos >= thr).mean()), round(thr, 4)


def auc(pos, neg):
    from sklearn.metrics import roc_auc_score
    y = np.concatenate([np.ones_like(pos), np.zeros_like(neg)])
    return float(roc_auc_score(y, np.concatenate([pos, neg])))


def cv_logistic_auc(feat_pos, feat_neg, seed):
    """5-fold CV AUC of a logistic on stacked features — honest complementarity upper bound."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_predict
    from sklearn.metrics import roc_auc_score

    X = np.vstack([feat_pos, feat_neg])
    y = np.concatenate([np.ones(len(feat_pos)), np.zeros(len(feat_neg))])
    proba = cross_val_predict(LogisticRegression(max_iter=1000), X, y, cv=5,
                              method="predict_proba")[:, 1]
    return float(roc_auc_score(y, proba))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--instances", type=int, default=160)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    cache = ROOT / "models" / f"eval_cache_i{args.instances}_s{args.seed}.pkl"
    blob = pickle.loads(cache.read_bytes())  # self-produced local cache (trusted)
    dino, clip = blob["dino"], blob["clip"]
    pos_pairs, neg_pairs = blob["positives"], blob["negatives"]

    def sig(name, pairs):
        """Per-pair cosine for a named base signal."""
        out = []
        for a, b in pairs:
            if name == "clip_whole":
                v = _cos(clip[a]["whole"], clip[b]["whole"])
            elif name == "clip_crop":
                v = _cos(clip[a]["crop"], clip[b]["crop"])
            elif name == "dino_crop":
                v = _cos(dino[a]["crop"]["cls"], dino[b]["crop"]["cls"])
            elif name == "dino_whole":
                v = _cos(dino[a]["whole"]["cls"], dino[b]["whole"]["cls"])
            elif name == "dino_max":
                v = max(_cos(dino[a]["whole"]["cls"], dino[b]["whole"]["cls"]),
                        _cos(dino[a]["crop"]["cls"], dino[b]["crop"]["cls"]))
            else:
                raise KeyError(name)
            out.append(v)
        return np.asarray(out)

    bases = ["clip_whole", "clip_crop", "dino_whole", "dino_crop", "dino_max"]
    P = {b: sig(b, pos_pairs) for b in bases}
    N = {b: sig(b, neg_pairs) for b in bases}

    rows = []
    for b in bases:
        rows.append((b, auc(P[b], N[b]), P[b], N[b]))

    # deployable fusions (no trained model): combine a semantic (CLIP) + an instance (DINOv2) signal
    def fuse(op, a, b):
        pa, pb, na, nb = P[a], P[b], N[a], N[b]
        f = {"mean": lambda x, y: (x + y) / 2, "min": np.minimum, "max": np.maximum}[op]
        return f(pa, pb), f(na, nb)

    for a, b in [("clip_whole", "dino_max"), ("clip_crop", "dino_crop"),
                 ("clip_whole", "dino_crop")]:
        for op in ("mean", "min", "max"):
            fp, fn = fuse(op, a, b)
            rows.append((f"{op}({a},{b})", auc(fp, fn), fp, fn))

    # logistic upper bounds (CV) on complementary pairs — production regime uses the crop signals
    for a, b in [("clip_crop", "dino_crop"), ("clip_whole", "dino_max")]:
        fp = np.stack([P[a], P[b]], axis=1)
        fn = np.stack([N[a], N[b]], axis=1)
        rows.append((f"logistic({a},{b})", cv_logistic_auc(fp, fn, args.seed), None, None))

    rows.sort(key=lambda r: r[1], reverse=True)
    print(f"{'signal / fusion':34s} {'AUC':>7} {'TAR@1%':>8} {'TAR@5%':>8}")
    for name, a, p, n in rows:
        if p is None:
            print(f"{name:34s} {a:.4f} {'(cv)':>8} {'':>8}")
        else:
            t1, _ = tar_at_far(p, n, 0.01)
            t5, _ = tar_at_far(p, n, 0.05)
            print(f"{name:34s} {a:.4f} {t1:>8.3f} {t5:>8.3f}")


if __name__ == "__main__":
    main()
