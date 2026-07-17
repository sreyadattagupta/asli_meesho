"use client";

// Step 5 — Pricing. Selling price is required; MRP is optional and only meaningful ABOVE the selling
// price, so the discount a buyer sees is a real one.
import { useSellerStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useVoiceGuide } from "@/lib/useVoiceGuide";
import { WizardNav } from "./WizardNav";

const fieldCls =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet";

/** Clamp to the bounds the route's zod schema enforces, so the UI can't offer an invalid save. */
function toPrice(raw: string): number {
  return Math.min(100000, Math.max(0, Math.floor(Number(raw) || 0)));
}

export default function PricingStep() {
  const { draft, setDraft, setStep } = useSellerStore();
  const t = useT();
  useVoiceGuide("flow.pricing.voice");

  const priceOk = draft.price >= 1;
  // An MRP at or below the selling price is a fake discount. Blocked rather than silently corrected:
  // the seller should see what they typed and fix it.
  const mrpConflict = draft.mrp > 0 && draft.mrp <= draft.price;
  const discount = draft.mrp > draft.price ? Math.round((1 - draft.price / draft.mrp) * 100) : 0;

  return (
    <div className="card p-6">
      <h2 className="text-2xl font-bold">{t("flow.pricing.title")}</h2>
      <p className="mt-1 text-sm text-white/50">{t("flow.pricing.subtitle")}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/50">
            {t("flow.pricing.priceLabel")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={draft.price || ""}
            onChange={(e) => setDraft({ price: toPrice(e.target.value) })}
            aria-invalid={!priceOk}
            className={fieldCls}
          />
          <span className={`mt-1 block text-[11px] ${priceOk ? "text-white/35" : "text-asli-red"}`}>
            {priceOk ? t("flow.pricing.priceHint") : t("flow.pricing.priceError")}
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/50">
            {t("flow.pricing.mrpLabel")} <span className="text-white/25">{t("flow.optional")}</span>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            value={draft.mrp || ""}
            onChange={(e) => setDraft({ mrp: toPrice(e.target.value) })}
            aria-invalid={mrpConflict}
            className={fieldCls}
          />
          <span className={`mt-1 block text-[11px] ${mrpConflict ? "text-asli-red" : "text-white/35"}`}>
            {mrpConflict ? t("flow.pricing.mrpError") : t("flow.pricing.mrpHint")}
          </span>
        </label>
      </div>

      {discount > 0 && !mrpConflict && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="text-lg font-black text-white">₹{draft.price}</span>
          <span className="text-sm text-white/30 line-through">₹{draft.mrp}</span>
          <span className="pill bg-asli-green/15 text-asli-green ring-1 ring-asli-green/30">
            {t("flow.pricing.off", { n: discount })}
          </span>
          <span className="ml-auto text-[11px] text-white/35">{t("flow.pricing.discountPreview")}</span>
        </div>
      )}

      <WizardNav next={() => setStep("inventory")} nextDisabled={!priceOk || mrpConflict} />
    </div>
  );
}
