"use client";

// The two preferences that actually change the seller flow: interface language and voice guidance.
//
// Both already exist and are already persisted (lib/store.ts locale + ui slices, localStorage) — this
// page is where a seller would look for them, rather than only finding them as icons in the header.
import { Languages, Volume2 } from "lucide-react";
import { useLocaleStore, useUiStore } from "@/lib/store";
import { stopSpeaking } from "@/lib/voice";
import { useT } from "@/lib/i18n";

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet ${
        on ? "bg-asli-violet" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${
          on ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

export function SettingsPanel() {
  const t = useT();
  const { locale, toggleLocale } = useLocaleStore();
  const { voiceOn, toggleVoice } = useUiStore();

  return (
    <section className="card divide-y divide-white/5 p-5">
      <div className="flex items-center gap-4 pb-4">
        <Languages className="h-5 w-5 shrink-0 text-asli-violet" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-white/80">Language</h2>
          <p className="text-xs text-white/35">
            The seller flow is available in English and Hindi. Anything not yet translated falls back
            to English rather than showing you a blank.
          </p>
        </div>
        <button
          onClick={toggleLocale}
          className="btn-ghost min-h-[44px] shrink-0 px-4"
          aria-label={`Switch language, currently ${locale === "en" ? "English" : "Hindi"}`}
        >
          {locale === "en" ? "English" : "हिंदी"}
        </button>
      </div>

      <div className="flex items-center gap-4 pt-4">
        <Volume2 className="h-5 w-5 shrink-0 text-asli-violet" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-white/80">Voice guidance</h2>
          <p className="text-xs text-white/35">
            Reads each step of the listing flow aloud in your chosen language.
          </p>
        </div>
        <Toggle
          on={voiceOn}
          label={voiceOn ? t("nav.voice.on") : t("nav.voice.off")}
          onChange={() => {
            if (voiceOn) stopSpeaking(); // cut mid-sentence on mute
            toggleVoice();
          }}
        />
      </div>
    </section>
  );
}
