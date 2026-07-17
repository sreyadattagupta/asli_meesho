import { getSessionUser } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { unreadCount } from "@/lib/messages";
import { fail, ok } from "@/lib/api";

/**
 * What is waiting for the caller, and where it lives.
 *
 * One role-aware endpoint rather than one per portal, so the bell component stays dumb: it renders
 * whatever count and destination it is handed. Every number here is a real row — unread messages a
 * buyer or seller hasn't opened, or listings genuinely sitting in the review queue.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    // Signed out: no badge, no error. The bell simply doesn't render.
    if (!user) return ok({ count: 0, href: "/login", label: "Sign in" });

    if (user.role === "admin") {
      const repo = await repoReady();
      const pending = await repo.listPendingReviews();
      return ok({
        count: pending.length,
        href: "/admin/review",
        label: "Listings awaiting review",
      });
    }

    const count = await unreadCount(user);
    return ok({
      count,
      href: user.role === "seller" ? "/seller/messages" : "/buyer/orders",
      label: "Unread messages",
    });
  } catch {
    return fail(500, "internal", "Something went wrong.");
  }
}
