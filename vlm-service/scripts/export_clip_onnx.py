"""One-time export of the CLIP ViT-B/32 IMAGE encoder to ONNX (semantic half of the AND-gate).

The Agent-1 same-item gate requires BOTH a semantic signal (CLIP — rejects different-looking items)
and an instance signal (DINOv2 — rejects look-alike substitutes). To keep the serving container
torch-free, CLIP is exported to ONNX exactly like DINOv2 and served via onnxruntime.

We export only the vision path: pixel_values → visual_projection(vision_model(...).pooler_output),
i.e. the 512-d image embedding used for cosine. Text tower is not needed. Output:
    vlm-service/models/clip-vit-b32/model.onnx

Run once:  .venv-export/bin/python scripts/export_clip_onnx.py
"""
from __future__ import annotations

from pathlib import Path

MODEL_ID = "openai/clip-vit-base-patch32"
OUT_DIR = Path(__file__).resolve().parent.parent / "models" / "clip-vit-b32"


def main() -> None:
    import torch
    from transformers import CLIPModel

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    model = CLIPModel.from_pretrained(MODEL_ID).eval()

    class ImageEmbedder(torch.nn.Module):
        """pixel_values → 512-d projected image embedding (the CLIP image descriptor)."""

        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, pixel_values):
            v = self.m.vision_model(pixel_values=pixel_values)
            return self.m.visual_projection(v.pooler_output)

    wrapper = ImageEmbedder(model).eval()
    dummy = torch.randn(1, 3, 224, 224)
    onnx_path = OUT_DIR / "model.onnx"
    with torch.no_grad():
        torch.onnx.export(
            wrapper, (dummy,), str(onnx_path),
            # NB: output must NOT be named "embedding" — collides with CLIP's internal
            # position/patch-embedding tensors under the dynamo exporter ("Duplicate definition").
            input_names=["pixel_values"], output_names=["image_embeds"],
            dynamic_axes={"pixel_values": {0: "batch"}, "image_embeds": {0: "batch"}},
            opset_version=17, do_constant_folding=True,
        )
    if onnx_path.exists():
        print(f"exported → {onnx_path}  ({onnx_path.stat().st_size / 1e6:.1f} MB)")
    else:
        print(f"WARNING: expected {onnx_path} not found")


if __name__ == "__main__":
    main()
