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
import { GENERIC_NAV_MESSAGES } from "./loadingMessages";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Highlight only on an exact path match. Index pages need it or every child lights them up. */
  exact?: boolean;
  /** Tailored copy for the nav-loading overlay (components/nav/NavLoadingController.tsx). Falls
   *  back to GENERIC_NAV_MESSAGES via `navMessagesFor` when absent. */
  loadingMessages?: string[];
}

export const NAV: Record<Role, NavItem[]> = {
  seller: [
    {
      href: "/seller/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true,
      loadingMessages: ["Rounding up today's numbers…", "Straightening the welcome mat…", "Polishing your dashboard…"],
    },
    {
      href: "/seller/listings", label: "My Listings", icon: Package,
      loadingMessages: ["Lining your listings up on the shelf…", "Counting your catalogue…", "Fluffing the display pillows…"],
    },
    {
      href: "/seller/create-listing", label: "Create Listing", icon: PackagePlus,
      loadingMessages: ["Rolling out the red carpet for a new listing…", "Warming up the camera…", "Clearing a spot on the shelf…"],
    },
    {
      href: "/seller/orders", label: "Orders", icon: Receipt,
      loadingMessages: ["Chasing down your parcels…", "Sorting the delivery pile…", "Following the courier trail…"],
    },
    {
      href: "/seller/analytics", label: "Analytics", icon: BarChart3,
      loadingMessages: ["Crunching your numbers…", "Drawing the pretty charts…", "Doing the math so you don't have to…"],
    },
    {
      href: "/seller/messages", label: "Messages", icon: MessageSquare,
      loadingMessages: ["Fetching your inbox…", "Checking who slid into your DMs…", "Sorting the fan mail…"],
    },
    {
      href: "/seller/profile", label: "Profile", icon: User,
      loadingMessages: ["Dusting off your profile…", "Finding your good side…"],
    },
    {
      href: "/seller/settings", label: "Settings", icon: Settings,
      loadingMessages: ["Finding all the knobs and switches…", "Oiling the hinges…"],
    },
  ],
  buyer: [
    {
      href: "/buyer/dashboard", label: "Shop", icon: Store, exact: true,
      loadingMessages: ["Wheeling out the shopping cart…", "Restocking the shelves…", "Rearranging the storefront…"],
    },
    {
      href: "/buyer/orders", label: "My Orders", icon: Receipt,
      loadingMessages: ["Tracking down your treasures…", "Peeking inside the delivery van…"],
    },
    {
      href: "/buyer/profile", label: "Profile", icon: User,
      loadingMessages: ["Dusting off your profile…", "Finding your good side…"],
    },
  ],
  admin: [
    {
      href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true,
      loadingMessages: ["Rounding up the metrics…", "Booting up mission control…"],
    },
    {
      href: "/admin/review", label: "Review Queue", icon: ShieldCheck,
      loadingMessages: ["Stacking up the review pile…", "Sharpening the red pen…"],
    },
    {
      href: "/admin/users", label: "Users", icon: Users,
      loadingMessages: ["Rounding up the crowd…", "Taking attendance…"],
    },
    {
      href: "/admin/reports", label: "Reports", icon: FileBarChart,
      loadingMessages: ["Compiling the paperwork…", "Stapling the reports together…"],
    },
  ],
};

/** Is `item` the page currently open? */
export function isActive(path: string, item: NavItem): boolean {
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
}

/** Loading-overlay copy for a nav item — its own tailored lines, or the generic fallback. */
export function navMessagesFor(item: NavItem): string[] {
  return item.loadingMessages ?? GENERIC_NAV_MESSAGES;
}

/**
 * Loading-overlay copy for an arbitrary destination path — used by the global link interceptor
 * (NavLoadingController) for navigations that don't originate from the sidebar. Matches the path
 * against every role's nav items (best/longest match wins so `/seller/listings` beats `/seller`),
 * falling back to the generic lines for detail pages, wizards, etc.
 */
export function navMessagesForPath(path: string): string[] {
  let best: NavItem | undefined;
  for (const items of Object.values(NAV)) {
    for (const item of items) {
      if (isActive(path, item) && (!best || item.href.length > best.href.length)) best = item;
    }
  }
  return best ? navMessagesFor(best) : GENERIC_NAV_MESSAGES;
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
