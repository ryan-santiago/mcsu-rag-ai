import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Real artwork, supplied by the user — `public/brand/readthememo-mark.png`
 * (the mascot mark alone; the combined Questronix + ReadTheMemo lockup lives
 * at `public/brand/qnx-and-readthememo-lockup.png` for contexts that need
 * both brands together, not wired up anywhere yet). `Logo`/`BrandMark` keep
 * the same prop shape mcsu-app's own image-based lockup used (`variant`,
 * `height`/`size`, `className`, `priority`), so this is now that pipeline,
 * not a placeholder.
 */

const MARK_SRC = "/brand/readthememo-mark.png";
/** The source PNG's actual pixel size — square. */
const MARK_INTRINSIC_SIZE = 1254;

type LogoProps = {
  variant?: "colour" | "white";
  /** Rendered height in pixels; the mark and wordmark scale together. */
  height?: number;
  className?: string;
  priority?: boolean;
};

export function Logo({ variant = "colour", height = 40, className, priority }: LogoProps) {
  const isWhite = variant === "white";

  return (
    <span
      className={cn("inline-flex items-center gap-[0.4em] leading-none select-none", className)}
      style={{ fontSize: height * 0.62 }}
      role="img"
      aria-label="ReadTheMemo"
    >
      <BrandMark variant={variant} size={height} priority={priority} />
      <span
        className={cn("font-bold tracking-tight", isWhite ? "text-white" : "text-foreground")}
        style={{ fontSize: "1em" }}
      >
        ReadTheMemo
      </span>
    </span>
  );
}

type MarkProps = {
  variant?: "colour" | "white";
  size?: number;
  className?: string;
  priority?: boolean;
};

/**
 * The mascot mark on its own — for tight spaces and the collapsed nav.
 *
 * The artwork is dark-navy-heavy, so on its own it would nearly disappear
 * against the (always-dark) auth brand panel — `variant="white"` wraps it in
 * a translucent light chip so it stays legible there, same reasoning the
 * previous SVG mark's background rect had, just as a backdrop now instead of
 * a fill.
 */
export function BrandMark({ variant = "colour", size = 32, className, priority }: MarkProps) {
  const isWhite = variant === "white";

  const mark = (
    <Image
      src={MARK_SRC}
      alt=""
      width={MARK_INTRINSIC_SIZE}
      height={MARK_INTRINSIC_SIZE}
      priority={priority}
      className="size-full object-contain"
    />
  );

  if (!isWhite) {
    return (
      <span
        className={cn("inline-flex shrink-0 select-none", className)}
        style={{ width: size, height: size }}
      >
        {mark}
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex shrink-0 select-none rounded-full bg-white/90 p-[0.12em]", className)}
      style={{ width: size, height: size }}
    >
      {mark}
    </span>
  );
}
