import type { Permission, Principal } from "@/lib/rbac";
import { canAny } from "@/lib/rbac";

/**
 * Icon *names*, not component references.
 *
 * `visibleNavigation()` runs in the server layout and its result is passed as
 * a prop into client components (the sidebar, the topbar). A React component
 * reference isn't serializable across that boundary — Next.js rejects it at
 * runtime. Resolve the name to a component only on the client, in
 * `NAV_ICONS` (`sidebar-nav.tsx`).
 */
export type NavIconKey =
  | "dashboard"
  | "chat"
  | "documents"
  | "ai-settings"
  | "users"
  | "access-control"
  | "settings";

/**
 * A known sub-route of a nav item, for the topbar breadcrumb trail. Plain
 * data, not a predicate function: `visibleNavigation()`'s result is passed as
 * a prop from the server layout into client components, and a function isn't
 * serializable across that boundary — the same reason `icon` above is a
 * name, not a component reference.
 */
export type NavBreadcrumbChild = {
  title: string;
  path?: string;
  dynamic?: boolean;
};

export type NavItem = {
  title: string;
  href: string;
  icon: NavIconKey;
  /** Item is hidden unless the user holds at least one of these. */
  permissions?: readonly Permission[];
  /** Match child routes too, e.g. /admin/users/123 highlights User Management. */
  matchNested?: boolean;
  /**
   * Sidebar highlight requires an exact path match, ignoring `matchNested` —
   * used when a sibling dynamic section (e.g. Recent Chats) does its own
   * highlighting for the nested routes, so the two don't light up together.
   * `matchNested` still applies for breadcrumb section-matching.
   */
  highlightExact?: boolean;
  /** Root breadcrumb text when it should read differently from the sidebar label — defaults to `title`. */
  breadcrumbTitle?: string;
  /** Known sub-routes, deepest match wins — see `breadcrumbsFor()`. */
  children?: readonly NavBreadcrumbChild[];
};

export type NavGroup = {
  /** `null` renders the group without a heading — used for the top-level items. */
  title: string | null;
  items: readonly NavItem[];
  /** Rendered after the static items — dynamic, per-user data fetched client-side. See `RecentChatsNav`. */
  dynamic?: "chat-history";
};

/**
 * The single source of truth for the sidebar. Adding a section means adding an
 * entry here; permissions are declared alongside the link so a nav item can
 * never drift from the page guard it points at.
 *
 * Future modules (document library, chat — see docs/ARCHITECTURE.md) get
 * their own group here once they ship; the RBAC and shell work underneath
 * this file doesn't need to change.
 */
export const NAVIGATION: readonly NavGroup[] = [
  {
    title: null,
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: "dashboard",
        permissions: ["dashboard:read"],
      },
    ],
  },
  {
    title: "Chat",
    items: [
      {
        title: "New Chat",
        href: "/chat",
        icon: "chat",
        permissions: ["chat:read"],
        matchNested: true,
        highlightExact: true,
        breadcrumbTitle: "Chat",
        children: [{ title: "Conversation", dynamic: true }],
      },
    ],
    // Recent Chats + the actual history rows, rendered by `RecentChatsNav` —
    // per-user data, so it can't live in this static config.
    dynamic: "chat-history",
  },
  {
    title: "Administration",
    items: [
      {
        title: "Documentation",
        href: "/admin/documents",
        icon: "documents",
        permissions: ["documents:read"],
        matchNested: true,
      },
      {
        title: "AI Settings",
        href: "/admin/ai-settings",
        icon: "ai-settings",
        permissions: ["ai_settings:read"],
        matchNested: true,
      },
      {
        title: "Access Control",
        href: "/admin/access-control",
        icon: "access-control",
        permissions: ["access_control:read"],
        matchNested: true,
      },
      {
        title: "User Management",
        href: "/admin/users",
        icon: "users",
        permissions: ["users:read"],
        matchNested: true,
      },
      {
        // No `permissions` — every active signed-in user reaches their own profile.
        title: "Settings & Profile",
        href: "/admin/settings",
        icon: "settings",
        matchNested: true,
      },
    ],
  },
];

/** Drops items the user cannot reach, then drops groups left empty. */
export function visibleNavigation(principal: Principal | null): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permissions || canAny(principal, item.permissions)),
  })).filter((group) => group.items.length > 0);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  return Boolean(item.matchNested) && pathname.startsWith(`${item.href}/`);
}

/** Breadcrumb/title lookup for the topbar. */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAVIGATION.flatMap((group) => group.items).find((item) => isNavItemActive(item, pathname));
}

export type Breadcrumb = { title: string; href?: string };

/**
 * The topbar's breadcrumb trail for a pathname — one crumb for the section
 * itself, plus one more if it matches a known child route. Sections with no
 * matching child, or no `children` at all, render as a single crumb.
 */
export function breadcrumbsFor(pathname: string): Breadcrumb[] {
  const item = findNavItem(pathname);
  if (!item) return [];

  const children = item.children ?? [];
  const exact = children.find((candidate) => candidate.path === pathname);

  const remainder = pathname.slice(item.href.length).replace(/^\//, "");
  const isSingleSegment = remainder.length > 0 && !remainder.includes("/");
  const dynamic = isSingleSegment ? children.find((candidate) => candidate.dynamic) : undefined;

  const rootTitle = item.breadcrumbTitle ?? item.title;
  const child = exact ?? dynamic;
  if (!child) return [{ title: rootTitle }];

  return [{ title: rootTitle, href: item.href }, { title: child.title }];
}
