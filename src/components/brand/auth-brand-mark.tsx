"use client";

import { usePathname } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { QnxReadTheMemoLockup } from "@/components/brand/qnx-readthememo-lockup";

type AuthBrandMarkProps = {
  variant?: "colour" | "white";
  height?: number;
  className?: string;
  priority?: boolean;
};

/**
 * Picks the right brand mark for the auth shell (`src/app/(auth)/layout.tsx`,
 * its only caller): the combined Questronix + ReadTheMemo lockup on
 * login/register — so it's clear this is a Questronix-operated system before
 * anyone signs in — and the plain ReadTheMemo `Logo` everywhere else
 * (pending, forgot-password), where that context has already been
 * established.
 *
 * A small client component specifically so it can read the current route —
 * the brand panel it renders into lives in the shared layout, not in the
 * individual page components, so this is the one place that needs to know
 * which page it is.
 */
export function AuthBrandMark({ variant, height, className, priority }: AuthBrandMarkProps) {
  const pathname = usePathname();
  const showQuestronixLockup = pathname === "/login" || pathname === "/register";

  if (showQuestronixLockup) {
    return <QnxReadTheMemoLockup height={height} priority={priority} className={className} />;
  }

  return <Logo variant={variant} height={height} priority={priority} className={className} />;
}
