"""CPU-local garment-type classifier training (scaled-down of notebooks/agent2_garment_classifier_colab.ipynb).

Runs on this CPU box: small MobileNetV3 + a subset + 2 epochs so it finishes in reasonable time, then
pushes the real trained model to the HF Hub. For full accuracy, run the Colab notebook on a T4 instead.
"""
from __future__ import annotations
import os
import numpy as np
import torch
from collections import Counter
from datasets import load_dataset, ClassLabel
from transformers import (AutoImageProcessor, AutoModelForImageClassification,
                          TrainingArguments, Trainer)
from torchvision.transforms import (Compose, RandomResizedCrop, Resize, CenterCrop,
                                    ToTensor, Normalize, RandomHorizontalFlip)
import evaluate

HUB_MODEL_ID = os.getenv("HUB_MODEL_ID", "dsreya/garment-type-classifier")
BASE_MODEL = os.getenv("BASE_MODEL", "timm/mobilenetv3_small_100.lamb_in1k")  # tiny, CPU-friendly
LABEL_COLUMN = os.getenv("LABEL_COLUMN", "subCategory")
MAX_SAMPLES = int(os.getenv("MAX_SAMPLES", "2500"))
EPOCHS = int(os.getenv("EPOCHS", "2"))

print(f"[local] device=CPU model={BASE_MODEL} label={LABEL_COLUMN} n<={MAX_SAMPLES} epochs={EPOCHS}", flush=True)

ds = load_dataset("ashraq/fashion-product-images-small", split="train")
ds = ds.filter(lambda r: r["masterCategory"] == "Apparel" and r[LABEL_COLUMN])
counts = Counter(ds[LABEL_COLUMN])
keep = {k for k, c in counts.items() if c >= 20}
ds = ds.filter(lambda r: r[LABEL_COLUMN] in keep)
if len(ds) > MAX_SAMPLES:
    ds = ds.shuffle(seed=42).select(range(MAX_SAMPLES))

labels = sorted(set(ds[LABEL_COLUMN]))
label2id = {l: i for i, l in enumerate(labels)}
id2label = {i: l for l, i in label2id.items()}
print(f"[local] {len(ds)} images | {len(labels)} classes: {labels}", flush=True)

ds = ds.map(lambda r: {"label": label2id[r[LABEL_COLUMN]]})
ds = ds.cast_column("label", ClassLabel(names=labels))
split = ds.train_test_split(test_size=0.15, seed=42, stratify_by_column="label")
train_ds, eval_ds = split["train"], split["test"]

proc = AutoImageProcessor.from_pretrained(BASE_MODEL)
size = proc.size.get("shortest_edge", proc.size.get("height", 224))
norm = Normalize(mean=proc.image_mean, std=proc.image_std)
train_tf = Compose([RandomResizedCrop(size), RandomHorizontalFlip(), ToTensor(), norm])
eval_tf = Compose([Resize(size), CenterCrop(size), ToTensor(), norm])

def _apply(tf):
    def f(batch):
        batch["pixel_values"] = [tf(img.convert("RGB")) for img in batch["image"]]
        return batch
    return f

train_ds.set_transform(_apply(train_tf))
eval_ds.set_transform(_apply(eval_tf))

model = AutoModelForImageClassification.from_pretrained(
    BASE_MODEL, num_labels=len(labels), id2label=id2label, label2id=label2id,
    ignore_mismatched_sizes=True)

def collate(batch):
    return {"pixel_values": torch.stack([b["pixel_values"] for b in batch]),
            "labels": torch.tensor([b["label"] for b in batch])}

acc = evaluate.load("accuracy")

def metrics(p):
    return acc.compute(predictions=np.argmax(p.predictions, axis=1), references=p.label_ids)

args = TrainingArguments(
    output_dir="garment-type-classifier", per_device_train_batch_size=32,
    per_device_eval_batch_size=32, num_train_epochs=EPOCHS, learning_rate=5e-4,
    warmup_ratio=0.1, eval_strategy="epoch", save_strategy="epoch", save_total_limit=1,
    load_best_model_at_end=True, metric_for_best_model="accuracy", greater_is_better=True,
    logging_steps=20, remove_unused_columns=False, fp16=False,
    push_to_hub=True, hub_model_id=HUB_MODEL_ID, report_to="none",
    hub_token=os.environ.get("HF_TOKEN"))

trainer = Trainer(model=model, args=args, train_dataset=train_ds, eval_dataset=eval_ds,
                  data_collator=collate, compute_metrics=metrics)
print("[local] training…", flush=True)
trainer.train()
print("[local] eval:", trainer.evaluate(), flush=True)
trainer.push_to_hub()
proc.push_to_hub(HUB_MODEL_ID)
print(f"[local] pushed to https://huggingface.co/{HUB_MODEL_ID}", flush=True)
