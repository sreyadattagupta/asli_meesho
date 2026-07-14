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
  /** Reported by the CV service /health when reachable. */
  cvMethod?: string;              // clip | phash | unavailable
  ocrAvailable?: boolean;
  vlmBackend?: string;            // ollama | gemini (inside the service)
  calibrationVersion?: string;
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
    let cvMethod: string | undefined;
    let ocrAvailable: boolean | undefined;
    let vlmBackend: string | undefined;
    let calibrationVersion: string | undefined;

    // The self-hosted CV service exposes a rich health endpoint to ping (local Ollama or HF Space).
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
        if (res.ok) {
          const h = await res.json();
          cvMethod = h.cv_method;
          ocrAvailable = h.ocr_available;
          vlmBackend = h.vlm_backend;
          calibrationVersion = h.calibration_version;
        }
      } catch {
        vlmHealthy = false;
        vlmLatencyMs = Date.now() - started;
      }
    }

    // `degraded` is set by the provider seam's fallback (withDegradation); mock is degraded by definition.
    const degraded = vlmProvider === "mock" || vlmDegraded() || !vlmHealthy;

    return ok<AgentMonitor>({
      vlmProvider, vlmHealthy, vlmLatencyMs, triggerSource, dataBackend, degraded,
      cvMethod, ocrAvailable, vlmBackend, calibrationVersion,
    });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
