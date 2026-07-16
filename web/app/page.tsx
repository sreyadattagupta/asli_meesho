// Landing — the platform explained end to end, for judges and sellers arriving cold.
// Server component: sections render on the server, and the only client JS is the hero's live proof
// card plus the shared <Reveal> wrapper.
import {
  Hero,
  ProblemSection,
  PipelineSection,
  PersonasSection,
  ArchitectureSection,
  StackSection,
  CtaSection,
} from "@/features/landing/sections";

export default function Home() {
  return (
    <main>
      <Hero />
      <ProblemSection />
      <PipelineSection />
      <PersonasSection />
      <ArchitectureSection />
      <StackSection />
      <CtaSection />
      <footer className="border-t border-white/5 px-6 py-10 text-center text-xs text-white/25">
        Asli — prevention at the point of listing, complementary to Project Suraksha.
      </footer>
    </main>
  );
}
