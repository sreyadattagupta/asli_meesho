// Landing sections. Server-rendered content; motion comes from the one <Reveal> client wrapper, so
// the page ships almost no JS beyond the hero's live proof card.
//
// Copy rule: prevention at the point of listing, complementary to Suraksha — never "counterfeit
// detection" (invariant #4). Every number here is sourced from the research sheet, not invented.
import { Reveal } from "./Reveal";
import { ProofHero } from "./ProofHero";
import { LandingCta } from "@/components/LandingCta";
import { Camera, Ruler, Radar, PackageCheck } from "lucide-react";

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-asli-violet/70">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-white/45">{sub}</p>}
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-16 sm:pt-24">
      {/* Ambient wash — the only decoration on the page; the proof card carries the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[52rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-asli-violet/15 blur-[120px]"
      />
      <div className="relative mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[1.1fr_auto]">
        <div className="text-center lg:text-left">
          <span className="pill bg-asli-violet/15 text-asli-violet ring-1 ring-asli-violet/30">
            ✦ MULTI-AGENT TRUST LAYER
          </span>
          <h1 className="mt-6 text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            <span className="bg-gradient-to-r from-asli-violet via-asli-pink to-asli-amber bg-clip-text text-transparent">
              असली
            </span>{" "}
            <span className="text-white/90">Asli</span>
          </h1>
          <p className="mt-5 text-2xl font-semibold text-white/80">Proof at the point of listing.</p>
          <p className="mx-auto mt-3 max-w-xl text-white/45 lg:mx-0">
            Sellers prove they hold the product and that the size is real — before the listing goes
            live. Prevention at the source, complementary to Project Suraksha.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <LandingCta />
            <a href="#how" className="btn-ghost">
              See how it works
            </a>
          </div>
        </div>
        <Reveal delay={0.15} className="mx-auto">
          <ProofHero />
        </Reveal>
      </div>
    </section>
  );
}

export function ProblemSection() {
  // Sources: S9 (sizing returns), S7 (Suraksha delistings), S10 (Meesho AOV).
  const stats = [
    { n: "40–60%", l: "of fashion returns trace back to sizing", s: "S9" },
    { n: "#2", l: "return reason across the category is size", s: "S9" },
    { n: "42L", l: "listings delisted in six months — after going live", s: "S7" },
  ];
  return (
    <section className="border-t border-white/5 px-6 py-20">
      <Reveal>
        <SectionHeading
          eyebrow="The problem"
          title="“Not as pictured” is decided before anyone clicks buy"
          sub="A listing goes live with a borrowed photo and a guessed size chart. The buyer finds out on delivery, and everyone pays for the return."
        />
      </Reveal>
      <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-3">
        {stats.map((s, i) => (
          <Reveal key={s.l} delay={i * 0.08}>
            <div className="card h-full p-6">
              <div className="text-4xl font-black tracking-tight text-white">{s.n}</div>
              <p className="mt-2 text-sm leading-snug text-white/45">{s.l}</p>
              <span className="mt-3 inline-block text-[10px] font-mono text-white/25">[{s.s}]</span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function PipelineSection() {
  // Numbered because this genuinely is a sequence — each agent runs in this order on every listing.
  const agents = [
    {
      icon: Camera,
      name: "Possession-Proof",
      q: "Do you actually hold it?",
      d: "A reverse-image hit only triggers a challenge — never a verdict. The seller photographs the product beside a dynamic, time-bound, single-use code.",
      c: "text-asli-violet",
    },
    {
      icon: Ruler,
      name: "Smart Sizing",
      q: "Is the size real?",
      d: "An A4 sheet calibrates pixels to centimetres. Chest, waist, length and shoulder are measured from the garment's own outline, then graded into a full chart.",
      c: "text-asli-pink",
    },
    {
      icon: Radar,
      name: "Risk Radar",
      q: "How risky is this listing?",
      d: "Seller history and listing signals set the confidence bar. Trusted sellers skip the challenge; only the risky few reach a human.",
      c: "text-asli-amber",
    },
    {
      icon: PackageCheck,
      name: "Promise Keeper",
      q: "Did it arrive as promised?",
      d: "Each listing's promises freeze at go-live. On delivery the photo is checked against that contract, and the outcome moves the seller's score.",
      c: "text-asli-green",
    },
  ];
  return (
    <section id="how" className="border-t border-white/5 px-6 py-20">
      <Reveal>
        <SectionHeading
          eyebrow="How it works"
          title="Four agents, one decision"
          sub="An orchestrator routes every listing by risk and records why. No silent verdicts — the seller, the buyer and the reviewer all see the reasoning."
        />
      </Reveal>
      <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-2">
        {agents.map((a, i) => (
          <Reveal key={a.name} delay={i * 0.06}>
            <div className="card group h-full p-6 transition hover:-translate-y-0.5 hover:border-white/20">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-white/25">0{i + 1}</span>
                <a.icon className={`h-4 w-4 ${a.c}`} aria-hidden />
                <h3 className="font-bold text-white">{a.name}</h3>
              </div>
              <p className={`mt-3 text-sm font-medium ${a.c}`}>{a.q}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/45">{a.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function PersonasSection() {
  const rows = [
    {
      who: "Sellers",
      d: "Prove possession once and earn the ✓ badge. Build trust and skip the challenge on later listings. Voice guidance and Hindi throughout.",
    },
    {
      who: "Buyers",
      d: "Every verified listing carries a measured size chart and a plain answer to “why should I trust this?” — with the agents' confidence attached.",
    },
    {
      who: "Trust & Safety",
      d: "Only the risky listings escalate, each arriving with the full agent trail. A reviewer's decision feeds straight back into the seller's score.",
    },
  ];
  return (
    <section className="border-t border-white/5 px-6 py-20">
      <Reveal>
        <SectionHeading eyebrow="Who it serves" title="Three portals, one trust record" />
      </Reveal>
      <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-3">
        {rows.map((p, i) => (
          <Reveal key={p.who} delay={i * 0.08}>
            <div className="card h-full p-6">
              <div className="text-sm font-bold text-asli-green">{p.who}</div>
              <p className="mt-2 text-sm leading-relaxed text-white/45">{p.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function ArchitectureSection() {
  return (
    <section className="border-t border-white/5 px-6 py-20">
      <Reveal>
        <SectionHeading
          eyebrow="Architecture"
          title="Built to sit inside Meesho, not beside it"
          sub="Asli feeds PRISM's ranking, complements Suraksha's enforcement, reuses Vaani for voice and BharatMLStack for inference."
        />
      </Reveal>
      <Reveal delay={0.1}>
        <div className="card mx-auto mt-12 max-w-3xl overflow-x-auto p-6">
          <pre className="text-[11px] leading-relaxed text-white/45">{`  Seller · Buyer · Trust & Safety
            ↓
  Next.js App Router — pages + API routes
            ↓
  Auth (JWT) → RBAC in middleware and per route
            ↓
  ASLI ORCHESTRATOR — routes by risk, rising strictness on retry
     ↓         ↓         ↓          ↓
  Agent 1   Agent 2   Agent 3    Agent 4
  possess    sizing     risk      promise
     └─────────┴────┬────┴──────────┘
                    ↓
  UNIFIED DECISION ENGINE → trust score, explainable + logged
                    ↓
  ✓ Published → /shop      ✎ Retry      Human review → /admin`}</pre>
        </div>
      </Reveal>
    </section>
  );
}

export function StackSection() {
  const stack = [
    { k: "Frontend", v: "Next.js 15 · React 19 · TypeScript · Tailwind · Framer Motion" },
    { k: "Vision", v: "Qwen2.5-VL on Ollama · Gemini 2.0 Flash · SigLIP · ViT garment classifier" },
    { k: "Measurement", v: "OpenCV — A4 homography, GrabCut silhouette, single-view metrology" },
    { k: "Data", v: "PostgreSQL (Supabase) · Storage · MongoDB identity · Qdrant vectors" },
    { k: "Models", v: "Trained on cloud GPU, versioned and served from the Hugging Face Hub" },
    { k: "Deploy", v: "Vercel · Cloud Run · GitHub Actions" },
  ];
  return (
    <section className="border-t border-white/5 px-6 py-20">
      <Reveal>
        <SectionHeading eyebrow="Technology" title="Real models, real geometry, $0 per call" />
      </Reveal>
      <div className="mx-auto mt-12 max-w-3xl divide-y divide-white/5">
        {stack.map((s, i) => (
          <Reveal key={s.k} delay={i * 0.04}>
            <div className="grid gap-1 py-4 sm:grid-cols-[8rem_1fr] sm:gap-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/35">{s.k}</div>
              <div className="text-sm text-white/55">{s.v}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function CtaSection() {
  return (
    <section className="border-t border-white/5 px-6 py-24">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            Real seller. Real product. Real size.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-white/45">
            Open it as a seller, a buyer, or a reviewer — every screen runs the live pipeline.
          </p>
          <div className="mt-8 flex justify-center">
            <LandingCta />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
