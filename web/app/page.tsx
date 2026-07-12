import { LandingCta } from "@/components/LandingCta";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
      <span className="pill mb-6 bg-asli-violet/15 text-asli-violet ring-1 ring-asli-violet/30">
        ✦ MULTI-AGENT TRUST LAYER
      </span>

      <h1 className="text-6xl font-black tracking-tight sm:text-7xl">
        <span className="bg-gradient-to-r from-asli-violet via-asli-pink to-asli-amber bg-clip-text text-transparent">
          असली
        </span>{" "}
        <span className="text-white/90">Asli</span>
      </h1>

      <p className="mt-5 text-xl text-white/70">Proof at the point of listing.</p>
      <p className="mt-2 max-w-xl text-white/50">
        An agentic trust layer that stops “not as pictured” before a listing goes
        live. Prove you hold it. Prove the size is real.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <LandingCta />
      </div>

      <div className="mt-14 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { t: "Possession proof", d: "Live code, not a screenshot", c: "text-asli-violet" },
          { t: "Live code match", d: "Dynamic, time-bound, single-use", c: "text-asli-pink" },
          { t: "Smart size chart", d: "One A4 sheet → real cm", c: "text-asli-amber" },
        ].map((f) => (
          <div key={f.t} className="card p-5 text-left">
            <div className={`text-sm font-bold ${f.c}`}>✓ {f.t}</div>
            <div className="mt-1 text-sm text-white/50">{f.d}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { who: "Sellers", d: "Prove possession once, earn the ✓ badge, skip re-checks as trust grows." },
          { who: "Buyers", d: "Shop listings with measured sizes and a visible “why you can trust this”." },
          { who: "Trust & Safety", d: "Only the risky <5% escalate — with every agent's reasoning attached." },
        ].map((p) => (
          <div key={p.who} className="card p-5 text-left">
            <div className="text-sm font-bold text-asli-green">{p.who}</div>
            <div className="mt-1 text-sm text-white/50">{p.d}</div>
          </div>
        ))}
      </div>

      <p className="mt-12 text-xs text-white/30">
        Real seller · Real product · Real size — prevention at the source,
        complementary to Suraksha.
      </p>
    </main>
  );
}
