import { requireRole, HttpError } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { vlmDegraded } from "@/lib/vlm/provider";

export interface AgentMonitor {
  vlmProvider: "gemini" | "ollama" | "mock";
  vlmHealthy: boolean;
  vlmLatencyMs: number | null;
  triggerSource: string;
  dataBackend: string;
  degraded: boolean;
}

/** Live self-report of the AI subsystem — provider, trigger source, backend, health. */
export async function GET() {
  try {
    await requireRole("admin");
    const vlmProvider = (process.env.VLM_PROVIDER as AgentMonitor["vlmProvider"]) ?? "mock";
    const triggerSource = process.env.TRIGGER_SOURCE ?? "mock";
    const dataBackend = process.env.DATA_BACKEND ?? "memory";

    let vlmHealthy = vlmProvider !== "mock"; // gemini/ollama expected up; mock is always "degraded"
    let vlmLatencyMs: number | null = null;

    // Only the self-hosted service exposes a health endpoint to ping.
    if (vlmProvider === "ollama") {
      const url = `${process.env.VLM_SERVICE_URL ?? "http://localhost:8000"}/health`;
      const started = Date.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        vlmHealthy = res.ok;
        vlmLatencyMs = Date.now() - started;
      } catch {
        vlmHealthy = false;
        vlmLatencyMs = Date.now() - started;
      }
    }

    // `degraded` is set by the provider seam's fallback (withDegradation); mock is degraded by definition.
    const degraded = vlmProvider === "mock" || vlmDegraded() || !vlmHealthy;

    return ok<AgentMonitor>({ vlmProvider, vlmHealthy, vlmLatencyMs, triggerSource, dataBackend, degraded });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
