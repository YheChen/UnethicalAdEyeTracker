/**
 * A compact pill that communicates the current gaze/playback status with a
 * colored dot and a short label. The "watching" state gets a gently pulsing
 * ringed dot to signal active, healthy tracking; the others use a steady dot.
 */

/** The four mutually-exclusive states the badge can represent. */
export type StatusKind = "calibrating" | "watching" | "paused" | "no-face";

export interface StatusBadgeProps {
  status: StatusKind;
  className?: string;
}

/** Visual + textual presentation per status, kept in one place for clarity. */
interface StatusStyle {
  /** Human-readable label shown in the pill. */
  label: string;
  /** Tailwind background color for the dot. */
  dotColor: string;
  /** Tailwind text color for the label. */
  textColor: string;
  /** Whether the dot should animate with a pulsing ring (active tracking). */
  pulse: boolean;
}

const STATUS_STYLES: Record<StatusKind, StatusStyle> = {
  watching: {
    label: "Watching",
    dotColor: "bg-emerald-400",
    textColor: "text-emerald-200",
    pulse: true,
  },
  calibrating: {
    label: "Calibrating",
    dotColor: "bg-amber-400",
    textColor: "text-amber-200",
    pulse: false,
  },
  paused: {
    label: "Paused",
    dotColor: "bg-rose-400",
    textColor: "text-rose-200",
    pulse: false,
  },
  "no-face": {
    label: "No Face Detected",
    dotColor: "bg-slate-200",
    textColor: "text-slate-200",
    pulse: false,
  },
};

export function StatusBadge({
  status,
  className = "",
}: StatusBadgeProps): JSX.Element {
  const style = STATUS_STYLES[status];

  return (
    <span
      // `chip` gives the pill shape/typography; glass-soft + border supply the
      // dark glassmorphism backing. Caller-supplied className is appended last.
      className={`chip glass-soft border border-white/10 ${style.textColor} ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`Status: ${style.label}`}
    >
      <span className="relative inline-flex h-2.5 w-2.5 items-center justify-center">
        {/* A soft expanding ring only while actively watching. */}
        {style.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-pulse-ring rounded-full ${style.dotColor}`}
            aria-hidden="true"
          />
        )}
        {/* The solid dot core, always shown. */}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${style.dotColor}`}
          aria-hidden="true"
        />
      </span>
      <span>{style.label}</span>
    </span>
  );
}

export default StatusBadge;
