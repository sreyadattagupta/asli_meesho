// Server wrapper — decides whether the dev-only persona bypass is available, then renders the
// client login UI. The bypass flag is read server-side (never shipped as a public env var).
import { LoginClient } from "@/components/LoginClient";

export default function LoginPage() {
  const devLogin =
    process.env.AUTH_TEST_BYPASS === "1" && process.env.NODE_ENV !== "production";
  return <LoginClient devLogin={devLogin} />;
}
