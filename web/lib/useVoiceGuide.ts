"use client";

// Announce a flow step's instruction on mount (and when the locale flips).
import { useEffect } from "react";
import { useT } from "./i18n";
import { useLocaleStore, useUiStore } from "./store";
import { speak, stopSpeaking } from "./voice";
import type { I18nKey } from "./i18n/en";

export function useVoiceGuide(key: I18nKey): void {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const voiceOn = useUiStore((s) => s.voiceOn);

  useEffect(() => {
    if (voiceOn) speak(t(key), locale);
    return () => stopSpeaking();
  }, [key, voiceOn, locale, t]);
}
