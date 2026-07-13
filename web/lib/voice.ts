// Voice guidance (Web Speech API) — for low-literacy Bharat sellers.
// Client-side only, zero keys. No-ops when unsupported, muted, or disabled by env.
"use client";

/** Speak one instruction, cancelling anything still playing. */
export function speak(text: string, locale: "en" | "hi"): void {
  if (typeof window === "undefined") return;
  if (process.env.NEXT_PUBLIC_ENABLE_VOICE !== "true") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel(); // one instruction at a time
  const u = new SpeechSynthesisUtterance(text);
  u.lang = locale === "hi" ? "hi-IN" : "en-IN";
  u.rate = 0.95;
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}
