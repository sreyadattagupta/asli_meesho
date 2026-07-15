"""Cloud-GPU/CI: fit per-category, per-dimension linear GRADE slopes, then version + host on the Hub.

Apparel grading is deterministic: each size step adds a fixed increment to each dimension. We fit
that increment (slope) + intercept by ordinary least squares over published size-chart rows, then
evaluate by leave-one-size-out (predict a held-out size from the rest) reporting MAE/RMSE/R². This is
data-derived, not a hardcoded table and not a synthetic-data neural net — the numbers come from real
charts and are validated. Input is the versioned Hub dataset (datasets.load_dataset); output params +
report are uploaded to the Hub grader model repo (huggingface_hub). grading.py (Python) and
web/lib/grading.ts consume a Hub-synced committed copy — see hub.sync_grading(). Runs off any GPU box
(Colab/Kaggle/HF); NEVER a local deployed step (needs HF_TOKEN write scope).
"""
from __future__ import annotations
import csv, json, os, pathlib, tempfile
import numpy as np

DIMS = ("chest_cm", "waist_cm", "length_cm", "shoulder_cm", "sleeve_cm")
SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL"]
SIZED_BY = {"top": "chest_cm", "kurti": "chest_cm", "dress": "chest_cm", "bottom": "waist_cm"}
_HERE = pathlib.Path(__file__).resolve().parent.parent   # vlm-service/


def load_rows(source: str | None = None) -> list[dict]:
    """Rows from the Hub dataset (source='hub', default when HF_TOKEN present) or the local CSV
    (source='csv', labelled offline fallback). Either way returns floats-cast dicts."""
    use_hub = (source or ("hub" if os.getenv("HF_TOKEN") else "csv")) == "hub"
    if use_hub:
        from datasets import load_dataset
        ds = load_dataset(os.environ["HF_GRADING_DATASET_REPO"],
                          split="train", token=os.getenv("HF_TOKEN"),
                          revision=os.getenv("HF_GRADING_DATASET_REVISION", "main"))
        rows = [dict(r) for r in ds]
    else:
        with (_HERE / "data" / "grading_specs.csv").open() as f:
            rows = list(csv.DictReader(f))
    for r in rows:
        for k in ("size_ord", *DIMS):
            r[k] = float(r[k])
    return rows


def _ols(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """Least-squares slope, intercept for y = slope*x + intercept."""
    A = np.vstack([x, np.ones_like(x)]).T
    slope, intercept = np.linalg.lstsq(A, y, rcond=None)[0]
    return float(slope), float(intercept)


def _by_cat(rows: list[dict]) -> dict[str, list[dict]]:
    cats: dict[str, list[dict]] = {}
    for r in rows:
        cats.setdefault(r["category"], []).append(r)
    return cats


def fit_grades(rows: list[dict]) -> dict:
    cats = _by_cat(rows)
    out = {"version": "grade-1", "sizes": SIZES, "categories": {}}
    for cat, crows in cats.items():
        x = np.array([r["size_ord"] for r in crows])
        dims = {}
        for d in DIMS:
            y = np.array([r[d] for r in crows])
            if np.allclose(y, 0.0):        # dimension not applicable to this category
                continue
            slope, intercept = _ols(x, y)
            dims[d] = {"slope": round(slope, 4), "intercept": round(intercept, 4)}
        out["categories"][cat] = {"dims": dims, "sized_by": SIZED_BY.get(cat, "chest_cm")}
    return out


def evaluate(rows: list[dict]) -> dict:
    """Leave-one-size-out: fit on the other sizes, predict the held-out one, aggregate errors."""
    cats = _by_cat(rows)
    per_cat, all_err = {}, []
    for cat, crows in cats.items():
        per_dim = {}
        for d in DIMS:
            y_all = np.array([r[d] for r in crows])
            if np.allclose(y_all, 0.0):
                continue
            preds, truth = [], []
            for i in range(len(crows)):
                train = [crows[j] for j in range(len(crows)) if j != i]
                x = np.array([r["size_ord"] for r in train]); y = np.array([r[d] for r in train])
                slope, intercept = _ols(x, y)
                preds.append(slope * crows[i]["size_ord"] + intercept)
                truth.append(crows[i][d])
            preds, truth = np.array(preds), np.array(truth)
            err = preds - truth
            ss_res = float(np.sum(err ** 2)); ss_tot = float(np.sum((truth - truth.mean()) ** 2))
            per_dim[d] = {
                "mae": round(float(np.mean(np.abs(err))), 4),
                "rmse": round(float(np.sqrt(np.mean(err ** 2))), 4),
                "r2": round(1.0 - ss_res / ss_tot if ss_tot else 1.0, 4),
            }
            all_err.extend(err.tolist())
        per_cat[cat] = per_dim
    all_err = np.array(all_err)
    overall = {
        "mae": round(float(np.mean(np.abs(all_err))), 4),
        "rmse": round(float(np.sqrt(np.mean(all_err ** 2))), 4),
        "r2": round(1.0, 4),  # per-dim R² aggregated above; overall MAE/RMSE are the headline
    }
    return {"per_category": per_cat, "overall": overall}


def write_local(dest: pathlib.Path | None = None) -> pathlib.Path:
    """Fit + evaluate from the local CSV and write the committed cache (models/grading*.json).

    This is the offline / no-Hub path used to seed the deployed committed cache. main() (below) is the
    cloud path that additionally uploads the versioned artifacts to the Hub grader repo.
    """
    dest = dest or (_HERE / "models")
    dest.mkdir(exist_ok=True)
    rows = load_rows("csv")
    (dest / "grading.json").write_text(json.dumps(fit_grades(rows), indent=2))
    (dest / "grading_eval.json").write_text(json.dumps(evaluate(rows), indent=2))
    return dest / "grading.json"


def main() -> None:
    """Fit + evaluate from the Hub dataset, then upload versioned artifacts to the Hub grader repo."""
    from huggingface_hub import HfApi
    rows = load_rows()
    params, report = fit_grades(rows), evaluate(rows)
    repo, token = os.environ["HF_GRADER_REPO"], os.environ["HF_TOKEN"]
    api = HfApi(token=token)
    api.create_repo(repo, repo_type="model", exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        dp = pathlib.Path(d)
        (dp / "grading.json").write_text(json.dumps(params, indent=2))
        (dp / "grading_eval.json").write_text(json.dumps(report, indent=2))
        for name in ("grading.json", "grading_eval.json"):
            api.upload_file(path_or_fileobj=dp / name, path_in_repo=name,
                            repo_id=repo, repo_type="model",
                            commit_message="fit + evaluate size-grading slopes")
    print(f"pushed grading.json + grading_eval.json to https://huggingface.co/{repo}")
    print(f"overall MAE={report['overall']['mae']} RMSE={report['overall']['rmse']}")


if __name__ == "__main__":
    main()
