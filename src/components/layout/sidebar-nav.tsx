"use client";

import {
  BrainCircuit,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { RecentChatsNav } from "@/components/chat/recent-chats-nav";
import { can, type Principal } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { isNavItemActive, type NavGroup, type NavIconKey } from "@/lib/navigation";

/** Resolves the serializable icon key from `lib/navigation.ts` to a component. */
const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  chat: MessageSquare,
  documents: FileText,
  "ai-settings": BrainCircuit,
  users: Users,
  "access-control": ShieldCheck,
  settings: Settings,
};

type SidebarNavProps = {
  groups: NavGroup[];
  user: Principal;
  /** Called after a link is followed, so the mobile drawer can close itself. */
  onNavigate?: () => void;
};

/**
 * The nav list itself, shared by the desktop rail and the mobile drawer.
 *
 * The active item is marked with `aria-current` for assistive tech and a
 * primary-colour bar for everyone else. Coral is reserved strictly for
 * AI-generated content badges (see docs/DESIGN.md) — the nav rail uses the
 * general brand colour instead.
 */
export function SidebarNav({ groups, user, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-6 px-3">
      {groups.map((group, index) => (
        <div key={group.title ?? `group-${index}`} className="space-y-1">
          {group.title ? (
            <h2 className="text-muted-foreground/70 px-3 pt-1 pb-2 text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
              {group.title}
            </h2>
          ) : null}

          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = item.highlightExact ? pathname === item.href : isNavItemActive(item, pathname);
              const Icon = NAV_ICONS[item.icon];

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "bg-primary absolute inset-y-1.5 left-0 w-[3px] rounded-full transition-opacity",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {group.dynamic === "chat-history" ? (
            <RecentChatsNav
              canEdit={can(user, "chat:edit")}
              canDelete={can(user, "chat:delete")}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      ))}
    </nav>
  );
}
