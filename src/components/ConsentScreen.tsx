/**
 * ConsentScreen — the landing hero shown in the "idle" phase.
 *
 * Explains the premise (an ad that only plays while you look at it), lays out
 * the privacy guarantees up front, sketches the three-step flow, and offers a
 * single primary CTA that kicks off the (webcam-requesting) demo.
 */

import PrivacyNote from "./PrivacyNote";

export interface ConsentScreenProps {
  /** Invoked when the user presses "Start Demo" — the next step requests the webcam. */
  onStart: () => void;
}

/** Inline shield-check icon used for each privacy guarantee. */
function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3 4 6v5c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 11.5 2 2 4-4" />
    </svg>
  );
}

/** The four standout privacy guarantees, each rendered with a shield-check icon. */
const PRIVACY_POINTS: readonly string[] = [
  "Webcam video is processed entirely in your browser.",
  "No images or video leave your computer.",
  "No recordings are saved.",
  "Camera access can be revoked at any time.",
];

/** A single step in the "How it works" strip. */
interface HowItWorksStep {
  index: number;
  title: string;
  detail: string;
  icon: JSX.Element;
}

const HOW_IT_WORKS: readonly HowItWorksStep[] = [
  {
    index: 1,
    title: "Consent",
    detail: "Grant one-time camera access.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9 12 2 2 4-4" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    index: 2,
    title: "Calibrate",
    detail: "Look at the center to set a baseline.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    ),
  },
  {
    index: 3,
    title: "Watch",
    detail: "The ad plays only while you watch.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

export function ConsentScreen({ onStart }: ConsentScreenProps): JSX.Element {
  return (
    <div className="bg-grid flex min-h-screen w-full items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-3xl animate-fade-in-up">
        {/* Hero ------------------------------------------------------------ */}
        <header className="mb-8 text-center">
          <span className="chip glass-soft mx-auto mb-6 text-brand-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-300" />
            </span>
            Gaze-aware advertising demo
          </span>

          <h1 className="text-gradient text-4xl font-extrabold tracking-tight sm:text-6xl">
            EyeTrack Ad Demo
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-base text-slate-300 sm:text-lg">
            A YouTube-style advertisement that only plays while you are actually
            looking at it. Glance away and it pauses — all powered by on-device
            webcam gaze tracking.
          </p>
        </header>

        {/* Privacy guarantees --------------------------------------------- */}
        <section
          className="glass-panel animate-scale-in rounded-2xl p-6 sm:p-8"
          aria-labelledby="privacy-heading"
        >
          <h2
            id="privacy-heading"
            className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300"
          >
            <ShieldCheckIcon className="h-4 w-4 text-brand-300" />
            Your privacy, by design
          </h2>

          <ul className="grid gap-3 sm:grid-cols-2">
            {PRIVACY_POINTS.map((point) => (
              <li
                key={point}
                className="glass-soft flex items-start gap-3 rounded-xl px-4 py-3 text-sm text-slate-200"
              >
                <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works --------------------------------------------------- */}
        <section
          className="mt-6 animate-fade-in"
          aria-labelledby="how-heading"
        >
          <h2
            id="how-heading"
            className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-400"
          >
            How it works
          </h2>

          <ol className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {HOW_IT_WORKS.map((step, i) => (
              <li
                key={step.title}
                className="flex flex-1 items-center gap-3 sm:flex-col sm:text-center"
              >
                <div className="glass-soft flex w-full flex-1 items-center gap-3 rounded-xl px-4 py-3 sm:flex-col sm:gap-2 sm:py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-200">
                    <span className="h-5 w-5">{step.icon}</span>
                  </span>
                  <span className="flex flex-col sm:items-center">
                    <span className="text-sm font-semibold text-slate-100">
                      <span className="mr-1 text-brand-300">
                        {step.index}.
                      </span>
                      {step.title}
                    </span>
                    <span className="text-xs text-slate-400">
                      {step.detail}
                    </span>
                  </span>
                </div>

                {/* Connector arrow between steps (hidden after the last one). */}
                {i < HOW_IT_WORKS.length - 1 && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="hidden h-5 w-5 shrink-0 text-slate-500 sm:block"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* CTA ------------------------------------------------------------ */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={onStart}
            className="btn btn-primary w-full px-8 py-3 text-base sm:w-auto"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.5-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
            </svg>
            Start Demo
          </button>

          <p className="text-center text-xs text-slate-400">
            The next step will ask for permission to use your webcam.
          </p>

          <PrivacyNote />
        </div>
      </div>
    </div>
  );
}

export default ConsentScreen;
