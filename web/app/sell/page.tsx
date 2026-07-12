"use client";

import Link from "next/link";
import { useSellerStore } from "@/lib/store";
import Stepper from "@/components/flow/Stepper";
import UploadStep from "@/components/flow/UploadStep";
import TriggerStep from "@/components/flow/TriggerStep";
import ChallengeStep from "@/components/flow/ChallengeStep";
import SizingStep from "@/components/flow/SizingStep";
import ReviewStep from "@/components/flow/ReviewStep";
import ResultStep from "@/components/flow/ResultStep";

export default function SellPage() {
  const step = useSellerStore((s) => s.step);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-black tracking-tight">
          <span className="bg-gradient-to-r from-asli-violet to-asli-pink bg-clip-text text-transparent">
            असली
          </span>{" "}
          Asli
        </Link>
        <span className="pill bg-white/5 text-white/40">seller flow</span>
      </header>

      <Stepper step={step} />

      {step === "upload" && <UploadStep />}
      {step === "trigger" && <TriggerStep />}
      {step === "challenge" && <ChallengeStep />}
      {step === "sizing" && <SizingStep />}
      {step === "review" && <ReviewStep />}
      {step === "live" && <ResultStep />}
    </main>
  );
}
