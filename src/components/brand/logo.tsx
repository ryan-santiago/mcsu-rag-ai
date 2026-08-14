import { cn } from "@/lib/utils";

/**
 * Placeholder wordmark — there is no master logo artwork yet (the user will
 * supply one later). `Logo`/`BrandMark` keep the same prop shape mcsu-app's
 * image-based lockup used (`variant`, `height`/`size`, `className`,
 * `priority`) so swapping this for a real derived-asset pipeline later (see
 * `docs/DESIGN.md`) touches only this file, not any caller.
 *
 * `priority` is accepted but unused — it only matters for `next/image`, kept
 * here so call sites don't need to change when this becomes an `<Image>`.
 */

type LogoProps = {
  variant?: "colour" | "white";
  /** Rendered height in pixels; the mark and wordmark scale together. */
  height?: number;
  className?: string;
  priority?: boolean;
};

export function Logo({ variant = "colour", height = 40, className }: LogoProps) {
  const isWhite = variant === "white";

  return (
    <span
      className={cn("inline-flex items-center gap-[0.4em] leading-none select-none", className)}
      style={{ fontSize: height * 0.62 }}
      role="img"
      aria-label="MINAI"
    >
      <BrandMark variant={variant} size={height} />
      <span
        className={cn("font-bold tracking-tight", isWhite ? "text-white" : "text-foreground")}
        style={{ fontSize: "1em" }}
      >
        MINAI
      </span>
    </span>
  );
}

const MARK_ASPECT = 1;

type MarkProps = {
  variant?: "colour" | "white";
  size?: number;
  className?: string;
};

/** The node-cluster mark on its own — for tight spaces and the collapsed nav. */
export function BrandMark({ variant = "colour", size = 32, className }: MarkProps) {
  const isWhite = variant === "white";

  return (
    <svg
      viewBox="0 0 32 32"
      width={Math.round(size * MARK_ASPECT)}
      height={size}
      className={cn("shrink-0 select-none", className)}
      aria-hidden
    >
      <rect
        width="32"
        height="32"
        rx="8"
        fill={isWhite ? "rgba(255,255,255,0.12)" : "var(--primary)"}
      />
      <g stroke={isWhite ? "#fff" : "#fff"} strokeWidth="1.4" strokeLinecap="round">
        <line x1="10" y1="10" x2="16" y2="16" />
        <line x1="22" y1="10" x2="16" y2="16" />
        <line x1="10" y1="22" x2="16" y2="16" />
        <line x1="22" y1="22" x2="16" y2="16" />
      </g>
      <circle cx="16" cy="16" r="2.6" fill={isWhite ? "#fff" : "#fff"} />
      <circle cx="10" cy="10" r="1.6" fill={isWhite ? "#fff" : "#fff"} opacity="0.85" />
      <circle cx="22" cy="10" r="1.6" fill={isWhite ? "#fff" : "#fff"} opacity="0.85" />
      <circle cx="10" cy="22" r="1.6" fill={isWhite ? "#fff" : "#fff"} opacity="0.85" />
      <circle cx="22" cy="22" r="1.6" fill={isWhite ? "#fff" : "#fff"} opacity="0.85" />
    </svg>
  );
}
