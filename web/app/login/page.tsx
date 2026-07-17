// Server wrapper — bounces anyone already signed in, then decides whether the dev-only persona
// bypass is available and renders the client login UI. The bypass flag is read server-side (never
// shipped as a public env var).
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ROLE_HOME, safeReturnTo } from "@/lib/roles";
import { LoginClient } from "@/features/auth/LoginClient";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  // A signed-in user has no business on the login screen (spec §8). Showing it invites them to
  // "sign in" as someone else on top of a live session, and a seller who refreshes here should land
  // back on their dashboard, not on a form.
  const user = await getSessionUser();
  if (user) {
    const { returnTo } = await searchParams;
    redirect(safeReturnTo(returnTo, user.role) || ROLE_HOME[user.role]);
  }

  const devLogin =
    process.env.AUTH_TEST_BYPASS === "1" && process.env.NODE_ENV !== "production";
  return <LoginClient devLogin={devLogin} />;
}
