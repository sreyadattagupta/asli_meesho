"use client";

// Trust trajectory — plain SVG polyline (no chart lib; declared-stack rule).
interface Pt { delta: number }

export function TrustSparkline({ events, current }: { events: Pt[]; current: number }) {
  const totalDelta = events.reduce((s, e) => s + e.delta, 0);
  let running = current - totalDelta; // reconstruct the starting score
  const scores = [running, ...events.map((e) => (running += e.delta))];

  const W = 240, H = 60, P = 4;
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const stepX = scores.length > 1 ? (W - P * 2) / (scores.length - 1) : 0;
  const y = (score: number) => H - P - (clamp(score) / 100) * (H - P * 2);
  const pts = scores.map((s, i) => `${P + i * stepX},${y(s)}`).join(" ");
  const up = scores[scores.length - 1] >= scores[0];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" role="img" aria-label={`Trust trend, now ${current}`}>
      <line x1={P} y1={y(70)} x2={W - P} y2={y(70)} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
      {scores.length > 1 && (
        <polyline
          points={pts} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          stroke={up ? "#22C55E" : "#F59E0B"}
        />
      )}
      {scores.map((s, i) => (
        <circle key={i} cx={P + i * stepX} cy={y(s)} r={i === scores.length - 1 ? 3 : 1.6} fill={up ? "#22C55E" : "#F59E0B"} />
      ))}
    </svg>
  );
}
