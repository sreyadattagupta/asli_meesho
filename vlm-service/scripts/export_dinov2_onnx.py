"""One-time, reproducible export of DINOv2-small to ONNX for the Agent-1 same-instance backbone.

Run this ONCE (in an env that has torch+transformers — e.g. `.venv-export`) to produce the pinned
artifact the serving path loads with onnxruntime alone:

    .venv-export/bin/python scripts/export_dinov2_onnx.py

Provenance: we export the OFFICIAL facebook/dinov2-small (Apache-2.0, 22.1M params) rather than
trust a third-party ONNX mirror. We use torch.onnx directly (not optimum) so the export is robust
against transformers/optimum version drift. We emit the FULL token sequence `last_hidden_state`
(1, 1+P, 384) so the runtime can choose its pooling (CLS, mean-patch, or CLS+mean concat) from
eval data without re-exporting. The runtime (dino_embed.py) never needs torch.
Output: vlm-service/models/dinov2-small/model.onnx
"""
from __future__ import annotations

from pathlib import Path

MODEL_ID = "facebook/dinov2-small"
OUT_DIR = Path(__file__).resolve().parent.parent / "models" / "dinov2-small"


def main() -> None:
    import torch
    from transformers import AutoModel

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    model = AutoModel.from_pretrained(MODEL_ID)
    model.eval()

    class SeqEmbedder(torch.nn.Module):
        """Emit the full token sequence last_hidden_state (1, 1+P, 384) — runtime picks the pooling."""

        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, pixel_values):
            return self.m(pixel_values=pixel_values).last_hidden_state

    wrapper = SeqEmbedder(model).eval()
    dummy = torch.randn(1, 3, 224, 224)
    onnx_path = OUT_DIR / "model.onnx"

    with torch.no_grad():
        torch.onnx.export(
            wrapper,
            (dummy,),
            str(onnx_path),
            input_names=["pixel_values"],
            output_names=["last_hidden_state"],
            dynamic_axes={"pixel_values": {0: "batch"}, "last_hidden_state": {0: "batch"}},
            opset_version=17,
            do_constant_folding=True,
        )

    if onnx_path.exists():
        print(f"exported → {onnx_path}  ({onnx_path.stat().st_size / 1e6:.1f} MB)")
    else:
        print(f"WARNING: expected {onnx_path} not found")


if __name__ == "__main__":
    main()
