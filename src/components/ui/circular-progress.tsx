import { cn } from "@/lib/utils";

type CircularProgressTone = "primary" | "warning" | "destructive";

const TONE_CLASSES: Record<CircularProgressTone, string> = {
  primary: "stroke-primary",
  warning: "stroke-warning",
  destructive: "stroke-destructive",
};

type CircularProgressProps = {
  /** 0–100. Ignored when `indeterminate` is set. */
  value?: number;
  /** A spinning partial ring for operations with no measurable percentage (replacing, deleting). */
  indeterminate?: boolean;
  /** primary (uploading), warning (embedding), destructive (failed) — see `documents-view.tsx`. */
  tone?: CircularProgressTone;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Screen-reader label — the visual ring carries no text of its own. */
  label: string;
};

/**
 * The upload/embed/replace/delete "progress circle" used throughout the
 * Documentation table. Determinate mode draws a real percentage (uploads via
 * `XMLHttpRequest.upload.onprogress`, embedding via `embeddedChunkCount` /
 * `chunkCount`); indeterminate mode is a spinning partial ring for operations
 * with no meaningful percentage (replace/delete are near-instant local disk
 * writes; embedding's parsing phase has no count yet — see
 * `documents-view.tsx`).
 */
export function CircularProgress({
  value = 0,
  indeterminate = false,
  tone = "primary",
  size = 28,
  strokeWidth = 3,
  className,
  label,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const dashoffset = indeterminate ? circumference * 0.75 : circumference * (1 - clamped / 100);

  return (
    <svg
      role="progressbar"
      aria-label={label}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0 -rotate-90", indeterminate && "animate-spin", className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-muted"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashoffset}
        className={cn("transition-[stroke-dashoffset] duration-200 ease-linear", TONE_CLASSES[tone])}
      />
    </svg>
  );
}
