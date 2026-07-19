# Open-source attribution

Every third-party library, framework, model, and service used in **Asli Meesho**, with its exact
**version**, **license**, **role in this build**, and **source link** — the four things the submission
brief asks for. Derived-vs-directly-integrated is broken out in *Integration type* below, and the
restrictions that actually bite are in *Licensing obligations*.

**How to reproduce these numbers** (they are read from the installed tree, not copied from a wishlist):

```bash
cd web && npm ci
# versions
node -e "for(const p of Object.keys({...require('./package.json').dependencies,...require('./package.json').devDependencies})) console.log(p, require(\`./node_modules/\${p}/package.json\`).version)"
# licenses
node -e "for(const p of Object.keys({...require('./package.json').dependencies,...require('./package.json').devDependencies})) console.log(p, require(\`./node_modules/\${p}/package.json\`).license)"
```

Python versions are the floors pinned in `vlm-service/requirements.txt`; the deployed container also
installs the exact pins in `vlm-service/Dockerfile` (torch 2.5.1, torchvision 0.20.1), which is the
authority for what actually runs in production.

## Web application (`web/` — Node 22, npm)

| Name | Version | License | Role in Asli | Source |
|---|---|---|---|---|
| Next.js | 15.5.20 | MIT | App framework — App Router pages + API route handlers | https://github.com/vercel/next.js |
| React | 19.2.7 | MIT | UI runtime | https://github.com/facebook/react |
| React DOM | 19.2.7 | MIT | React DOM renderer | https://github.com/facebook/react |
| TypeScript | 5.7.3 | Apache-2.0 | Typed contracts end-to-end (strict) | https://github.com/microsoft/TypeScript |
| Tailwind CSS | 3.4.17 | MIT | Styling / design tokens (§9 palette) | https://github.com/tailwindlabs/tailwindcss |
| PostCSS | 8.4.49 | MIT | CSS pipeline for Tailwind | https://github.com/postcss/postcss |
| Autoprefixer | 10.4.20 | MIT | Vendor-prefix CSS | https://github.com/postcss/autoprefixer |
| Framer Motion | 12.42.2 | MIT | Animation — step/page transitions, gestures, shared-layout | https://github.com/framer/motion |
| Zustand | 5.0.14 | MIT | Client state (seller-flow / session / locale / ui slices) | https://github.com/pmndrs/zustand |
| lucide-react | 1.24.0 | ISC | Icon set (tree-shaken) | https://github.com/lucide-icons/lucide |
| clsx | 2.1.1 | MIT | Conditional class names (part of `cn()`) | https://github.com/lukeed/clsx |
| tailwind-merge | 3.6.0 | MIT | Tailwind conflict resolution (part of `cn()`) | https://github.com/dcastil/tailwind-merge |
| zod | 4.4.3 | MIT | Route input validation + error envelope | https://github.com/colinhacks/zod |
| @supabase/supabase-js | 2.110.2 | MIT | Managed PostgreSQL client (deployed backend) | https://github.com/supabase/supabase-js |
| mongodb | 7.5.0 | Apache-2.0 | MongoDB driver — email/password account store (auth) | https://github.com/mongodb/node-mongodb-native |
| Vitest | 4.1.10 | MIT | Unit + integration tests (engines, routes, RBAC) — dev | https://github.com/vitest-dev/vitest |
| @playwright/test | 1.61.1 | Apache-2.0 | 3-persona E2E — dev | https://github.com/microsoft/playwright |
| ESLint | 9.39.5 | MIT | Linting — dev | https://github.com/eslint/eslint |
| eslint-config-next | 15.5.20 | MIT | Next.js lint rules — dev | https://github.com/vercel/next.js |
| @types/node, @types/react, @types/react-dom | 22.10.5 / 19.2.17 / 19.2.3 | MIT | Type definitions — dev | https://github.com/DefinitelyTyped/DefinitelyTyped |

## VLM service (`vlm-service/` — Python, FastAPI)

| Name | Version | License | Role in Asli | Source |
|---|---|---|---|---|
| FastAPI | ≥0.115 | MIT | VLM service HTTP API (`/vlm/match`, `/vlm/measure`, `/vlm/embed`, `/vlm/similar`) | https://github.com/fastapi/fastapi |
| Uvicorn | ≥0.34 | BSD-3-Clause | ASGI server | https://github.com/encode/uvicorn |
| python-multipart | ≥0.0.20 | Apache-2.0 | Multipart form parsing (image uploads) | https://github.com/Kludex/python-multipart |
| httpx | ≥0.28 | BSD-3-Clause | HTTP client → Ollama | https://github.com/encode/httpx |
| Pillow | ≥11.3 | HPND (MIT-style) | Image compositing + decoding | https://github.com/python-pillow/Pillow |
| numpy | ≥2.0 | BSD-3-Clause | Homography DLT (Agent 2 metrology), cosine + Laplacian blur math | https://github.com/numpy/numpy |
| scipy | ≥1.13 | BSD-3-Clause | Variance-of-Laplacian focus metric (`ndimage.laplace`) — quality gate | https://github.com/scipy/scipy |
| qdrant-client | ≥1.12 | Apache-2.0 | Vector similarity (local mode) — embedding TRIGGER source | https://github.com/qdrant/qdrant-client |
| RapidFuzz | ≥3.9 | MIT | Fuzzy title/brand agreement — Agent 1 cross-source verification | https://github.com/rapidfuzz/RapidFuzz |
| selectolax | ≥0.3 | MIT | Fast HTML parse (JSON-LD / OpenGraph) — Agent 1 web-evidence collection | https://github.com/rushter/selectolax |
| opencv-python-headless | ≥4.10,<5 | Apache-2.0 | **Required.** Garment segmentation (GrabCut), HSV colour gate + ORB corroboration (Agent 1 `instance.py`), copy-move forensics. Pinned `<5`: the 5.0.0 pre-release throws a Windows access violation in-process alongside torch on py3.14 | https://github.com/opencv/opencv-python |
| onnxruntime | ≥1.20 | MIT | **Serving runtime for the same-item backbones** — DINOv2-small/CLIP run as ONNX so the deployed service needs no torch for Agent 1's gate. Ships cp314 wheels, so the same path runs locally and in the py3.11 container | https://github.com/microsoft/onnxruntime |
| Organika/sdxl-detector (optional) | — | Apache-2.0 | AI-generated-image classifier — Agent 1 forensics; degrades to `unavailable`, never fabricated | https://huggingface.co/Organika/sdxl-detector |
| ImageHash | ≥4.3 | BSD-2-Clause | Perceptual-hash trigger fallback when the ONNX model file is absent | https://github.com/JohannesBuchner/imagehash |
| PaddleOCR (+ paddlepaddle) | ≥2.7 / ≥2.6 | Apache-2.0 | Dedicated code-slip OCR cross-check, fused with the VLM read (Agent 1). **Installed in the deployed Cloud Run image** (py3.11); optional locally, where py3.14 has no cp314 wheel and the code degrades to VLM-OCR only | https://github.com/PaddlePaddle/PaddleOCR |
| torch | 2.5.1 (CPU wheel) | BSD-3-Clause | **Required in the deployed image** — runs the three HF models below (SigLIP gate, garment-type ViT, SegFormer). Not needed locally, where the ONNX path covers Agent 1 | https://github.com/pytorch/pytorch |
| torchvision | 0.20.1 (CPU wheel) | BSD-3-Clause | Image transforms backing the torch model path. Version-locked to torch 2.5.1 — a mismatched pair fails at import | https://github.com/pytorch/vision |
| transformers | ≥4.44,<5 | Apache-2.0 | Loads and runs SigLIP, SegFormer and the garment-type classifier | https://github.com/huggingface/transformers |
| safetensors | ≥0.4 | Apache-2.0 | Weight format for the HF models baked into the image | https://github.com/huggingface/safetensors |
| sentencepiece | ≥0.2 | Apache-2.0 | Tokeniser required by SigLIP's text tower | https://github.com/google/sentencepiece |
| accelerate | ≥0.34 | Apache-2.0 | Device placement / `device_map="cpu"` for the HF pipelines | https://github.com/huggingface/accelerate |
| huggingface_hub | ≥0.23 | Apache-2.0 | Agent 2 grading: version/host/download the fitted grade params from the HF Hub (`hub.sync_grading`), + landmark Inference Endpoint call. Deployed-safe read-only (no torch) | https://github.com/huggingface/huggingface_hub |
| datasets (train only) | ≥2.19 | Apache-2.0 | Agent 2: version the grading dataset on the HF Hub + `load_dataset` in the cloud fit. In `training/requirements-train.txt`, NOT the deployed service | https://github.com/huggingface/datasets |
| transformers + `Trainer` + torch (train only) | ≥4.41 / ≥2.2 | Apache-2.0 / BSD-3 | Agent 2 landmark model fine-tune on cloud GPU (DeepFashion2). `training/requirements-train.txt` only — deployed CPU service never imports them | https://github.com/huggingface/transformers · https://github.com/pytorch/pytorch |

## External models, runtimes & services

| Name | License / tier | Role in Asli | Source |
|---|---|---|---|
| Ollama | MIT | Local model runtime (self-hosted, $0/call) | https://github.com/ollama/ollama |
| Qwen2.5-VL | Apache-2.0 (Qwen) | Vision-language model — Agents 1 & 2 (local) | https://huggingface.co/Qwen |
| Gemini 2.0 Flash | Commercial (free tier) | Deployed cloud VLM (PPT-declared fallback); plain REST, no SDK | https://ai.google.dev |
| CLIP (clip-vit-base-patch32) | MIT (weights: OpenAI) | Image embeddings for the Qdrant trigger | https://github.com/openai/CLIP |
| SigLIP — `google/siglip-large-patch16-384` | Apache-2.0 | Agent 1 same-product gate on the deployed service — loaded in-container via transformers | https://huggingface.co/google/siglip-large-patch16-384 |
| SigLIP — `google/siglip-base-patch16-224` | Apache-2.0 | Baked-in rollback target for the gate (`SIGLIP_MODEL` swaps to it); the large-calibrated threshold does not transfer, so it is a deliberate fallback, not a default | https://huggingface.co/google/siglip-base-patch16-224 |
| **`mattmdjaga/segformer_b2_clothes`** | **NVIDIA Source Code License for SegFormer — NON-COMMERCIAL** ⚠️ | Clothes segmentation (isolates the garment from background before embedding) for Agents 1 & 2. Fine-tuned on the ATR-derived `mattmdjaga/human_parsing_dataset`. **See "Licensing obligations" below — this one is not commercially redistributable** | https://huggingface.co/mattmdjaga/segformer_b2_clothes |
| Hugging Face Hub — model `dsreya/garment-type-classifier` | own repo | Garment-type classification (kurti / saree / top …) feeding the size-chart grading path; `image-classification` pipeline on CPU | https://huggingface.co/dsreya/garment-type-classifier |
| Hugging Face Hub — model `dsreya/promise-dinov2` | own repo, Apache-2.0 (DINOv2-small backbone) | **Agent 4** delivery-vs-catalog matcher — trained separately from Agent 1's because a buyer's delivery photo is a different distribution (parcel lighting, creases, partial unwrap) and needs a looser bar | https://huggingface.co/dsreya/promise-dinov2 |
| Hugging Face Hub — model `dsreya/asli-onnx-backbones` | own repo (CLIP MIT · DINOv2 Apache-2.0) | Hosts the exported CLIP + DINOv2 ONNX backbones so they are downloaded at image build instead of shipped in the Cloud Build source upload (which timed out at ~450MB) | https://huggingface.co/dsreya/asli-onnx-backbones |
| DINOv2 (`facebook/dinov2-small`) | Apache-2.0 | Backbone fine-tuned into `garment-dinov2` and `promise-dinov2`; beats CLIP on instance-level matching (measured, not assumed) | https://github.com/facebookresearch/dinov2 |
| SerpAPI (Google Lens) | Commercial (free tier, cached, mockable) | Reverse-image TRIGGER (never a verdict) | https://serpapi.com |
| catbox.moe | Free service | Keyless temp image host for SerpAPI fetch-by-URL | https://catbox.moe |
| Email/password + JWT (in-house) | — | Sign-up / sign-in (`/api/auth/register`, `/login`) + signed session (HMAC-SHA256 via `node:crypto`, no new dep) + RBAC. No third-party auth provider is used | — |
| Supabase | Free tier | Managed PostgreSQL (deployed store) + Storage bucket `product-images` for catalog/flat-lay/live photo bytes (public read, server-side write) | https://supabase.com |
| MongoDB Atlas | Free tier (M0) | Hosted account store behind the `mongodb` driver | https://www.mongodb.com/atlas |
| Vercel | Free tier (Hobby) | Deployment (web) | https://vercel.com |
| **Google Cloud Run** | Pay-as-you-go (billing enabled) | **Hosts the CV/VLM service** (`asli-meesho-vlm`, `us-central1`, 12Gi/4cpu) so the deployed demo runs the real pipeline — cosine, homography, OCR | https://cloud.google.com/run |
| Docker | Apache-2.0 | Container image for the CV service (`python:3.11-slim` base), built by Cloud Build | https://github.com/moby/moby |
| Google Cloud SDK (`gcloud`) | Apache-2.0 | Deploy + logs for Cloud Run (wrapped by `vlm-service/deploy.ps1`) | https://cloud.google.com/sdk |
| Hugging Face Spaces | Free tier (CPU, Docker SDK) | **Not the live host.** The image keeps its Docker-SDK frontmatter so it stays Spaces-compatible, but the deployed service is Cloud Run (Docker Spaces need PRO — free tier returns 402) | https://huggingface.co/spaces |
| Hugging Face Hub — dataset `garment-grading-specs` | own repo (from ISO 8559 size charts) | Versioned Agent 2 grading dataset (`datasets`) — input to the cloud grade-slope fit | https://huggingface.co/datasets |
| Hugging Face Hub — model `garment-size-grader` | own repo, MIT | Fitted per-size grade slopes (`grading.json`) hosted + versioned; deployed app/service sync a committed cache | https://huggingface.co/models |
| DeepFashion2 (`zyuzuguldu/deepfashion2-upper-body-masks`) | Apache-2.0 | Garment segmentation masks — training data for the Agent 2 landmark seam (HF `Trainer`, cloud GPU); full landmarks `sahirp/deepfashion2` (MIT) | https://huggingface.co/datasets/zyuzuguldu/deepfashion2-upper-body-masks |
| DeepFashion In-shop (`Marqo/deepfashion-inshop`) | research/non-commercial (CUHK DeepFashion) | Agent 1: same-instance/cross-pose positives + same-cat+colour look-alike hard negatives to FINE-TUNE the garment matcher (`training/train_garment_embed.py`, cloud GPU) and to calibrate the same-item bar (`scripts/eval_matcher.py`) | https://huggingface.co/datasets/Marqo/deepfashion-inshop |
| Hugging Face Hub — model `garment-dinov2` | own repo, Apache-2.0 (DINOv2-small backbone) | Fine-tuned Agent-1 same-instance matcher (`model.onnx`) served by `garment_embed.py` via onnxruntime; deployed service syncs it from the Hub | https://huggingface.co/models |
| HF Inference Endpoint — `garment-landmark-seg` | own repo (RTMPose/YOLO11-seg lineage) | Optional GPU landmark seam; CPU silhouette is the default deployed path | https://huggingface.co/models |
| Web Speech API | Browser built-in | Voice-guided seller steps (client-side) | https://developer.mozilla.org/docs/Web/API/Web_Speech_API |

## Integration type — direct use vs. modified / derived work

Everything in the tables above is consumed as a **published package or hosted model, unmodified**, with
these exceptions — the only places where we produced a derivative work:

| Ours | Derived from | What we changed |
|---|---|---|
| `dsreya/garment-dinov2` | `facebook/dinov2-small` (Apache-2.0) | Fine-tuned for same-instance garment matching on `Marqo/deepfashion-inshop`, then exported to ONNX (`scripts/export_dinov2_onnx.py`). Weights are ours; the backbone architecture and its licence are DINOv2's |
| `dsreya/promise-dinov2` | `facebook/dinov2-small` (Apache-2.0) | Separately fine-tuned on synthetically degraded delivery-style images for Agent 4 |
| `dsreya/garment-type-classifier` | ViT image-classification backbone | Fine-tuned for garment-category prediction |
| `dsreya/asli-onnx-backbones` | OpenAI CLIP (MIT) · DINOv2 (Apache-2.0) | Format conversion only — exported to ONNX, weights unchanged |
| `dsreya/garment-size-grader`, `dsreya/garment-grading-specs` | ISO 8559 published size charts | Our own fitted grade slopes + the dataset assembled to fit them |

No third-party source code is vendored, patched, or forked in this repository — every library is
installed from its official registry at the version pinned above.

## Licensing obligations — read before any commercial use

This is a hackathon prototype, and two dependencies are **not cleared for commercial deployment**.
Both are declared here rather than buried, because shipping them inside Meesho would require action:

| Item | Restriction | Consequence | Swap path |
|---|---|---|---|
| **`mattmdjaga/segformer_b2_clothes`** | NVIDIA Source Code License for SegFormer: *"The Work and any derivative works thereof only may be used or intended for use non-commercially."* | Clothes segmentation weights cannot ship in a commercial Meesho build as-is | Already isolated: `clothes_seg.py` degrades to the **GrabCut** path (OpenCV, Apache-2.0) on any failure, and the model is env-swappable via `CLOTHES_SEG_MODEL`. Replace with a permissively-licensed segmenter — no other code changes |
| **DeepFashion / DeepFashion In-shop** (`Marqo/deepfashion-inshop`) | CUHK research / non-commercial terms | Used as **training and calibration data** for `garment-dinov2` and the same-item threshold | Re-fit on licensed or first-party catalogue imagery. Meesho's own catalogue is the natural replacement and would likely improve accuracy on Indian ethnicwear |

Everything else we chose directly is MIT, Apache-2.0, BSD, ISC, or HPND — permissive and safe for
commercial use with attribution.

**Transitive dependencies, audited rather than assumed.** Scanning the full installed tree (426
packages) gives 357 MIT · 30 Apache-2.0 · 20 ISC · 8 BSD-2 · 2 BSD-3 · 1 each 0BSD / BlueOak / CC0 /
CC-BY-4.0 / Python-2.0 — and **four weak-copyleft packages**, none of which we selected and none
strong copyleft:

| Package | License | Pulled in by | Exposure |
|---|---|---|---|
| `lightningcss` (+ platform binary) | MPL-2.0 | Next.js build tooling | Build-time only, `dev: true` — never shipped |
| `axe-core` | MPL-2.0 | accessibility linting | Dev dependency, `dev: true` — never shipped |
| `@img/sharp-*` / `sharp-libvips` | Apache-2.0 **AND** LGPL-3.0-or-later | Next.js image optimization | Runtime. The LGPL part is the pre-built libvips binary, used unmodified via a dynamic boundary |

**There is no AGPL, GPL, or other strong-copyleft dependency anywhere in the tree.** MPL-2.0 is
file-level copyleft — it obliges publishing changes *to those files*, and we modify neither. LGPL
obliges relinking rights for libvips, satisfied by consuming the stock binary. So nothing here can
impose a source-disclosure obligation on Meesho's wider codebase — but the claim is "audited and
bounded", not "zero copyleft", because the honest answer is four packages, not none.

Third-party API terms still apply where used: SerpAPI (free tier, cached and mockable) and Gemini
(free tier) are commercial services governed by their own terms, not open-source licences.

## Research references (cited in-product and in the design)

- Bai et al. 2025 — *Qwen2.5-VL Technical Report* (arXiv:2502.13923)
- Criminisi, Reid & Zisserman 2000 — *Single-View Metrology* (IJCV) — pixel→cm calibration basis (Agent 2)
- Hartley & Zisserman 2004 — *Multiple View Geometry* — DLT planar homography (Agent 2 perspective rectification)
- Pech-Pacheco et al. 2000 — variance-of-Laplacian focus measure (image quality / anti-spoof gate)
- Platt 1999 — *Probabilistic Outputs for SVMs* — logistic (Platt) confidence calibration (all agents)
- ISO/IEC 30107-1 — *Presentation Attack Detection* framework (anti-spoof framing)
- Jøsang & Ismail 2002 — *The Beta Reputation System* — Risk Radar trust scoring (Agent 3)
- Chow 1970; Geifman & El-Yaniv 2017 — reject-option / selective prediction (escalate-to-human gate)
- Radford et al. 2021 — *CLIP: Learning Transferable Visual Models from Natural Language Supervision*
- Malkov & Yashunin 2018 — *HNSW* approximate nearest-neighbour (vector search basis)

Impact statistics (S1–S16) are sourced in `Meesho_Ecosystem_Problem_Solution_Research.xlsx`; the
40–60% sizing-returns figure used on the admin dashboard is source **S9**.

> No dependency, service, or model is used outside this list. Adding one requires updating this file
> (declared-stack rule, `CLAUDE.md` §11).
