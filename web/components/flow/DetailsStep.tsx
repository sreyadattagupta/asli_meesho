"use client";

// Step 4 — Product details. The first step where the seller types anything: Agent 1 has proven
// possession and Agent 2 has measured the garment before we ask for a single word.
import { useState } from "react";
import { useSellerStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useVoiceGuide } from "@/lib/useVoiceGuide";
import { WizardNav } from "./WizardNav";

const CATEGORIES = ["sarees", "kurtis", "footwear", "jewellery"] as const;

const fieldCls =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet";

export default function DetailsStep() {
  const { draft, setDraft, setStep, sizeChart } = useSellerStore();
  const t = useT();
  useVoiceGuide("flow.details.voice");
  // Don't shout "too short" at an empty field the seller hasn't reached yet — only after they leave
  // it, or press Next.
  const [touched, setTouched] = useState(false);

  const titleOk = draft.title.trim().length >= 3;

  return (
    <div className="card p-6">
      <h2 className="text-2xl font-bold">{t("flow.details.title")}</h2>
      <p className="mt-1 text-sm text-white/50">{t("flow.details.subtitle")}</p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/50">
            {t("flow.details.titleLabel")}
          </span>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ title: e.target.value })}
            onBlur={() => setTouched(true)}
            placeholder={t("flow.details.titlePlaceholder")}
            aria-invalid={touched && !titleOk}
            aria-describedby="title-hint"
            className={fieldCls}
          />
          <span
            id="title-hint"
            className={`mt-1 block text-[11px] ${touched && !titleOk ? "text-asli-red" : "text-white/35"}`}
          >
            {touched && !titleOk ? t("flow.details.titleError") : t("flow.details.titleHint")}
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/50">
            {t("flow.details.categoryLabel")}
          </span>
          <select
            value={draft.category}
            onChange={(e) => setDraft({ category: e.target.value as (typeof CATEGORIES)[number] })}
            className={fieldCls}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-[#160f26]">
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/50">
            {t("flow.details.descriptionLabel")}{" "}
            <span className="text-white/25">{t("flow.optional")}</span>
          </span>
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ description: e.target.value })}
            rows={4}
            maxLength={2000}
            placeholder={t("flow.details.descriptionPlaceholder")}
            className={`${fieldCls} resize-y`}
          />
        </label>

        {/* `size` is null when the garment was measured but the fitted model grades no size for it
            (lib/db/types.ts) — say nothing rather than invent a label. */}
        {sizeChart?.size && (
          <div className="rounded-xl border border-asli-green/20 bg-asli-green/[0.06] px-3 py-2.5 text-xs text-asli-green/90">
            {t("flow.details.sizeNote", { size: sizeChart.size })}
          </div>
        )}
      </div>

      <WizardNav
        next={() => {
          setTouched(true);
          if (titleOk) setStep("pricing");
        }}
        nextDisabled={!titleOk}
      />
    </div>
  );
}
