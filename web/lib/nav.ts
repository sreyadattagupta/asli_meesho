// The navigation model. Every menu, breadcrumb, and active-state decision in the app reads THIS —
// no portal hardcodes its own link list (spec §9). Add a page here and it appears in the sidebar,
// gets a breadcrumb, and highlights correctly, in one edit.
import {
  LayoutDashboard, Package, PackagePlus, Receipt, BarChart3, MessageSquare,
  User, Settings, Users, ShieldCheck, FileBarChart, Store,
  type LucideIcon,
} from "lucide-react";
import { ROLE_HOME } from "./roles";
import type { Role } from "./db/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Highlight only on an exact path match. Index pages need it or every child lights them up. */
  exact?: boolean;
}

export const NAV: Record<Role, NavItem[]> = {
  seller: [
    { href: "/seller/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/seller/listings", label: "My Listings", icon: Package },
    { href: "/seller/create-listing", label: "Create Listing", icon: PackagePlus },
    { href: "/seller/orders", label: "Orders", icon: Receipt },
    { href: "/seller/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/seller/messages", label: "Messages", icon: MessageSquare },
    { href: "/seller/profile", label: "Profile", icon: User },
    { href: "/seller/settings", label: "Settings", icon: Settings },
  ],
  buyer: [
    { href: "/buyer/dashboard", label: "Shop", icon: Store, exact: true },
    { href: "/buyer/orders", label: "My Orders", icon: Receipt },
    { href: "/buyer/profile", label: "Profile", icon: User },
  ],
  admin: [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/admin/review", label: "Review Queue", icon: ShieldCheck },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/reports", label: "Reports", icon: FileBarChart },
  ],
};

/** Is `item` the page currently open? */
export function isActive(path: string, item: NavItem): boolean {
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
}

// Segment → crumb label for paths the NAV list doesn't cover (detail pages, wizard steps).
const SEGMENT_LABELS: Record<string, string> = {
  seller: "Seller",
  buyer: "Shop",
  admin: "Admin",
  dashboard: "Dashboard",
  listings: "My Listings",
  "create-listing": "Create Listing",
  orders: "Orders",
  analytics: "Analytics",
  messages: "Messages",
  profile: "Profile",
  settings: "Settings",
  review: "Review Queue",
  users: "Users",
  reports: "Reports",
  sellers: "Sellers",
  checkout: "Checkout",
};

export interface Crumb {
  href: string;
  label: string;
}

/**
 * Breadcrumbs for a path. The role root always points at the role's home rather than at the bare
 * "/seller" segment, which is a redirect and not a page.
 */
export function breadcrumbs(path: string, role: Role): Crumb[] {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const crumbs: Crumb[] = [{ href: ROLE_HOME[role], label: SEGMENT_LABELS[segments[0]] ?? segments[0] }];

  let href = `/${segments[0]}`;
  for (const seg of segments.slice(1)) {
    href += `/${seg}`;
    // The dashboard IS the role root — a second "Seller / Dashboard" crumb says nothing twice.
    if (href === ROLE_HOME[role]) continue;
    crumbs.push({
      href,
      // Ids (order/listing/seller keys) aren't words; show a short handle instead of a raw uuid.
      label: SEGMENT_LABELS[seg] ?? (looksLikeId(seg) ? `#${seg.slice(0, 8)}` : titleCase(seg)),
    });
  }
  return crumbs;
}

function looksLikeId(s: string): boolean {
  return /\d/.test(s) && s.length > 6;
}

function titleCase(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
