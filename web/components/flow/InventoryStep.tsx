"use client";

// Step 6 — Inventory. Stock and an optional SKU.
//
// Defaults to 1 on purpose: the seller has just photographed the item in their own hands to prove
// possession, so one unit is the honest starting point. Anything higher is their claim to make.
import { useSellerStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useVoiceGuide } from "@/lib/useVoiceGuide";
import { WizardNav } from "./WizardNav";

const fieldCls =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet";

export default function InventoryStep() {
  const { draft, setDraft, setStep } = useSellerStore();
  const t = useT();
  useVoiceGuide("flow.inventory.voice");

  const stockOk = draft.stock >= 1;

  return (
    <div className="card p-6">
      <h2 className="text-2xl font-bold">{t("flow.inventory.title")}</h2>
      <p className="mt-1 text-sm text-white/50">{t("flow.inventory.subtitle")}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/50">
            {t("flow.inventory.stockLabel")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={draft.stock || ""}
            onChange={(e) =>
              setDraft({ stock: Math.min(100000, Math.max(0, Math.floor(Number(e.target.value) || 0))) })
            }
            aria-invalid={!stockOk}
            className={fieldCls}
          />
          <span className={`mt-1 block text-[11px] ${stockOk ? "text-white/35" : "text-asli-red"}`}>
            {stockOk ? t("flow.inventory.stockHint") : t("flow.inventory.stockError")}
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/50">
            {t("flow.inventory.skuLabel")} <span className="text-white/25">{t("flow.optional")}</span>
          </span>
          <input
            value={draft.sku}
            onChange={(e) => setDraft({ sku: e.target.value })}
            maxLength={40}
            placeholder="KURTI-BLK-M"
            className={fieldCls}
          />
          <span className="mt-1 block text-[11px] text-white/35">{t("flow.inventory.skuHint")}</span>
        </label>
      </div>

      <WizardNav
        next={() => setStep("review")}
        nextLabel={t("wizard.preview")}
        nextDisabled={!stockOk}
      />
    </div>
  );
}
