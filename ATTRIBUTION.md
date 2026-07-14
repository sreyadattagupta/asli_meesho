# Open-source attribution

Every third-party library, framework, model, and service used in **Asli Meesho**, with its exact
installed version, license, role in this build, and source. Versions are the ones actually installed
(`npm ls --depth=0` in `web/`; `vlm-service/requirements.txt`).

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
| opencv-python-headless (optional) | latest | Apache-2.0 | Copy-move forgery (ORB) — Agent 1 forensics; HF Space only | https://github.com/opencv/opencv-python |
| Organika/sdxl-detector (optional) | — | Apache-2.0 | AI-generated-image classifier — Agent 1 forensics; HF Space only | https://huggingface.co/Organika/sdxl-detector |
| ImageHash | ≥4.3 | BSD-2-Clause | Perceptual-hash trigger fallback when torch/CLIP wheels are unavailable | https://github.com/JohannesBuchner/imagehash |
| PaddleOCR (+ paddlepaddle) | ≥2.7 | Apache-2.0 | Dedicated code-slip OCR cross-check, fused with the VLM read (Agent 1) — active on the HF Space (py3.11); optional locally (no cp314 wheel) | https://github.com/PaddlePaddle/PaddleOCR |
| torch + transformers (optional) | latest | BSD-3 / Apache-2.0 | CLIP image embeddings (upgrade path; phash used otherwise) | https://github.com/pytorch/pytorch · https://github.com/huggingface/transformers |

## External models, runtimes & services

| Name | License / tier | Role in Asli | Source |
|---|---|---|---|
| Ollama | MIT | Local model runtime (self-hosted, $0/call) | https://github.com/ollama/ollama |
| Qwen2.5-VL | Apache-2.0 (Qwen) | Vision-language model — Agents 1 & 2 (local) | https://huggingface.co/Qwen |
| Gemini 2.0 Flash | Commercial (free tier) | Deployed cloud VLM (PPT-declared fallback); plain REST, no SDK | https://ai.google.dev |
| CLIP (clip-vit-base-patch32) | MIT (weights: OpenAI) | Image embeddings for the Qdrant trigger | https://github.com/openai/CLIP |
| SerpAPI (Google Lens) | Commercial (free tier, cached, mockable) | Reverse-image TRIGGER (never a verdict) | https://serpapi.com |
| catbox.moe | Free service | Keyless temp image host for SerpAPI fetch-by-URL | https://catbox.moe |
| Phone OTP + JWT (in-house) | — | Phone-number sign-in (demo OTP) + signed session (HMAC-SHA256 via node:crypto, no new dep) + RBAC | — |
| Supabase | Free tier | Managed PostgreSQL (deployed store) | https://supabase.com |
| Vercel | Free tier (Hobby) | Deployment (web) | https://vercel.com |
| Hugging Face Spaces | Free tier (CPU, Docker SDK) | Hosts the CV/VLM service so the deployed demo runs the real pipeline (cosine, homography, OCR) | https://huggingface.co/spaces |
| Web Speech API | Browser built-in | Voice-guided seller steps (client-side) | https://developer.mozilla.org/docs/Web/API/Web_Speech_API |

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
