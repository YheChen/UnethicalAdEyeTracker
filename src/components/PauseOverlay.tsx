/**
 * PauseOverlay
 *
 * A glassy "paused" curtain that lives INSIDE the ad player's relative
 * container (`inset-0`). It backdrop-blurs the frozen ad behind it and explains
 * why playback stopped — either the user looked away or their face left frame.
 *
 * It is ALWAYS mounted and toggles its own visibility via opacity +
 * pointer-events, so the fade in/out is smooth and the DOM stays stable.
 */

export interface PauseOverlayProps {
  /** Whether the overlay should be shown (faded in & interactive). */
  visible: boolean;
  /** Why playback paused — drives the heading/subtitle copy. */
  reason: "look-away" | "no-face";
}

/** Copy keyed by pause reason. */
const REASON_COPY: Record<
  PauseOverlayProps["reason"],
  { heading: string; subtitle: string }
> = {
  "look-away": {
    heading: "Please maintain eye contact",
    subtitle: "Continue looking at the advertisement to resume playback.",
  },
  "no-face": {
    heading: "Face not detected",
    subtitle: "Please return to the camera to resume playback.",
  },
};

export function PauseOverlay({ visible, reason }: PauseOverlayProps): JSX.Element {
  const { heading, subtitle } = REASON_COPY[reason];

  return (
    <div
      // Sits above the ad creative. Fades in/out; non-interactive when hidden so
      // it never swallows clicks meant for the player controls beneath it.
      className={`absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-black/55 px-6 text-center backdrop-blur-md transition-opacity duration-300 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      // Hide from assistive tech & tab order while invisible.
      aria-hidden={!visible}
      role="status"
      aria-live="polite"
    >
      {/* Animated eye inside pulsing rings to draw the gaze back to centre. */}
      <div className="relative flex h-20 w-20 items-center justify-center">
        {/* Expanding pulse-ring halo. */}
        <span className="absolute inset-0 rounded-full bg-brand-400/30 animate-pulse-ring" />
        {/* Soft static glow disc. */}
        <span className="absolute inset-2 rounded-full bg-brand-500/20 blur-md" />
        {/* The eye glyph itself. */}
        <span className="relative grid h-16 w-16 place-items-center rounded-full border border-white/15 bg-white/10 text-white shadow-glow-brand backdrop-blur-xl">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            {/* Pupil gently breathes to feel "alive". */}
            <circle cx="12" cy="12" r="3" className="animate-float" />
          </svg>
        </span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <h2 className="text-xl font-semibold text-white sm:text-2xl">{heading}</h2>
        <p className="max-w-xs text-sm text-slate-300">{subtitle}</p>
      </div>

      {/* Small reassuring affordance that playback resumes automatically. */}
      <span className="chip glass-soft text-slate-200">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        Paused — resumes when you look back
      </span>
    </div>
  );
}

export default PauseOverlay;
