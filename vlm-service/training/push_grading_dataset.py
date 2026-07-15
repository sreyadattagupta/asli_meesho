"""Publish the raw grading CSV to the Hugging Face Hub as a versioned dataset.

The CSV in-repo is the human-editable source of truth; the Hub dataset is what the cloud training job
loads (datasets.load_dataset), so training input is versioned, shareable, and reproducible off any
GPU box. Run once per dataset change; the push creates a new Hub commit (pin it with a tag for
reproducible fits). Requires HF_TOKEN with write scope — never run from the deployed service.
"""
from __future__ import annotations
import os, pathlib
from datasets import load_dataset

_HERE = pathlib.Path(__file__).resolve().parent.parent   # vlm-service/
REPO = os.environ["HF_GRADING_DATASET_REPO"]


def main() -> None:
    ds = load_dataset("csv", data_files=str(_HERE / "data" / "grading_specs.csv"), split="train")
    ds.push_to_hub(REPO, token=os.environ["HF_TOKEN"], commit_message="update grading specs")
    print(f"pushed {ds.num_rows} rows to https://huggingface.co/datasets/{REPO}")


if __name__ == "__main__":
    main()
