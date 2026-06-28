/**
 * App.tsx — the keystone of the EyeTrack Ad Demo.
 *
 * Owns the {@link DemoState} machine, the single off-screen tracking <video>,
 * the webcam + gaze-detection hooks, and composes the whole experience as a
 * YouTube-style watch page whose ad only plays while the user looks at it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AdPlayer from "./components/PlayerStage";
import CalibrationPanel from "./components/CalibrationPanel";
import ConfidenceMeter from "./components/ConfidenceMeter";
import ConsentScreen from "./components/ConsentScreen";
import DebugPanel from "./components/DebugPanel";
import PrivacyNote from "./components/PrivacyNote";
import StatusBadge from "./components/StatusBadge";
import type { StatusKind } from "./components/StatusBadge";
import WebcamPreview from "./components/WebcamPreview";

import { useGazeDetection } from "./hooks/useGazeDetection";
import { useWebcam } from "./hooks/useWebcam";
import type { WebcamStatus } from "./hooks/useWebcam";

import { AD_CREATIVES } from "./data/creatives";
import type { AdCreative } from "./data/creatives";
import type { DemoState } from "./types/gaze";

// ---------------------------------------------------------------------------
// Small presentational helpers (inline SVG icons — no icon library installed).
// ---------------------------------------------------------------------------

function EyeLogoIcon({ className = "" }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

function SearchIcon({ className = "" }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="m20 20-3.2-3.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RecalibrateIcon({ className = "" }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M20 11a8 8 0 1 0-.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M20 5v4h-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningIcon({ className = "" }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3 2.5 20h19L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 9.5v4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.8" r="1" fill="currentColor" />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 7.5V12l3 1.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Format a millisecond duration as mm:ss. */
function formatWatchTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

/** A friendly, human-readable headline for a webcam failure. */
function describeWebcamError(status: WebcamStatus, raw: string | null): string {
  if (status === "denied") {
    return "Camera access was blocked. The demo needs your webcam to detect where you are looking — no video ever leaves your device.";
  }
  if (status === "unsupported") {
    return "This browser does not support webcam access. Please try a recent version of Chrome, Edge, or Safari.";
  }
  return raw ?? "Something went wrong while starting the camera.";
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App(): JSX.Element {
  // The single shared webcam <video>. MediaPipe reads its frames directly; all
  // visible previews draw it onto their own canvases. It stays mounted for the
  // whole webcam lifecycle so face detection never stops.
  const videoRef = useRef<HTMLVideoElement>(null);

  const webcam = useWebcam(videoRef);

  const [phase, setPhase] = useState<DemoState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Which creative is currently on screen, and a key bump used to fully reset
  // the AdPlayer (and its clock) when the same ad is replayed/re-selected.
  const [adIndex, setAdIndex] = useState(0);
  const [playerEpoch, setPlayerEpoch] = useState(0);

  // Accumulated time (ms) the ad has actually played while attentive.
  const [watchTimeMs, setWatchTimeMs] = useState(0);

  // Detection is only meaningful (and the heavy rAF loop only runs) while the
  // user is in a webcam-backed phase.
  const active =
    phase === "calibrating" || phase === "watching" || phase === "paused";

  const gaze = useGazeDetection({ videoRef, active });

  const ad: AdCreative = AD_CREATIVES[adIndex] ?? AD_CREATIVES[0];

  // -------------------------------------------------------------------------
  // Derived playback flags (see contract §App).
  // -------------------------------------------------------------------------
  const sessionActive = phase === "watching" || phase === "paused";
  const playing = sessionActive && gaze.attentive;
  const paused = sessionActive && !gaze.attentive;
  const pauseReason: "look-away" | "no-face" = gaze.gaze.faceDetected
    ? "look-away"
    : "no-face";

  const status: StatusKind = useMemo(() => {
    if (phase === "calibrating") return "calibrating";
    if (!gaze.gaze.faceDetected && sessionActive) return "no-face";
    if (playing) return "watching";
    return "paused";
  }, [phase, gaze.gaze.faceDetected, sessionActive, playing]);

  // -------------------------------------------------------------------------
  // Flow / state-machine transitions.
  // -------------------------------------------------------------------------

  const handleStart = useCallback(async () => {
    setErrorMessage("");
    setPhase("permission");
    await webcam.start();
  }, [webcam]);

  // React to webcam status while waiting for permission.
  useEffect(() => {
    if (phase !== "permission") return;
    if (webcam.status === "active") {
      setPhase("calibrating");
    } else if (
      webcam.status === "denied" ||
      webcam.status === "unsupported" ||
      webcam.status === "error"
    ) {
      setErrorMessage(describeWebcamError(webcam.status, webcam.error));
      setPhase("error");
    }
  }, [phase, webcam.status, webcam.error]);

  // Drive watching <-> paused purely from attention while a session is active.
  useEffect(() => {
    if (!sessionActive) return;
    setPhase(gaze.attentive ? "watching" : "paused");
  }, [sessionActive, gaze.attentive]);

  const handleCalibrate = useCallback(() => {
    const base = gaze.calibrate();
    if (base) {
      setWatchTimeMs(0);
      setPhase("watching");
    }
  }, [gaze]);

  const recalibrate = useCallback(() => {
    gaze.resetCalibration();
    setPhase("calibrating");
  }, [gaze]);

  const handleTryAgain = useCallback(() => {
    webcam.stop();
    setErrorMessage("");
    setPhase("idle");
  }, [webcam]);

  const goToAd = useCallback((nextIndex: number) => {
    setAdIndex(nextIndex);
    // Bump the epoch so the AdPlayer remounts (clock resets) even if the index
    // happens to be unchanged.
    setPlayerEpoch((e) => e + 1);
  }, []);

  const handleSkip = useCallback(() => {
    goToAd((adIndex + 1) % AD_CREATIVES.length);
  }, [adIndex, goToAd]);

  const handleAdEnded = useCallback(() => {
    goToAd((adIndex + 1) % AD_CREATIVES.length);
  }, [adIndex, goToAd]);

  // -------------------------------------------------------------------------
  // Accumulate total watch time while the ad is genuinely playing.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const nowTs = performance.now();
      setWatchTimeMs((ms) => ms + (nowTs - last));
      last = nowTs;
    }, 250);
    return () => window.clearInterval(id);
  }, [playing]);

  // -------------------------------------------------------------------------
  // Keyboard shortcut: "c" or "r" recalibrates during a session.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!sessionActive) return;
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing into the (decorative) search field or any input.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "c" || key === "r") {
        e.preventDefault();
        recalibrate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessionActive, recalibrate]);

  // Stop the webcam when the component unmounts.
  useEffect(() => {
    return () => webcam.stop();
    // We intentionally bind to the stable `stop` identity only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cameraAvailable = webcam.status === "active";
  const trackingFailed = gaze.faceTrackingStatus === "error";

  // The "Up next" sidebar lists every other creative.
  const upNext = AD_CREATIVES.filter((_, i) => i !== adIndex);

  // -------------------------------------------------------------------------
  // Sub-views.
  // -------------------------------------------------------------------------

  /** Non-blocking banner shown when MediaPipe fails to load. */
  const renderTrackingBanner = () =>
    trackingFailed ? (
      <div className="glass-panel mx-auto mb-4 flex w-full max-w-3xl items-start gap-3 rounded-2xl border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100 animate-fade-in">
        <WarningIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
        <div>
          <p className="font-semibold">Gaze tracking failed to load.</p>
          <p className="text-amber-100/80">
            {gaze.faceTrackingError ??
              "The face-tracking model could not be initialised. You may be offline or on an unsupported device — the page still works, but playback won’t follow your gaze."}
          </p>
        </div>
      </div>
    ) : null;

  const renderError = () => (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel w-full max-w-lg rounded-3xl p-8 text-center animate-scale-in">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
          <WarningIcon className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-white">Camera unavailable</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {errorMessage}
        </p>
        <div className="mt-5 rounded-2xl bg-white/[0.04] p-4 text-left text-xs leading-relaxed text-slate-400">
          <p className="mb-1 font-semibold text-slate-300">
            To re-enable the camera:
          </p>
          <p>
            Click the camera / lock icon in your browser’s address bar, set
            Camera to “Allow”, then press “Try again”.
          </p>
        </div>
        <button
          type="button"
          onClick={handleTryAgain}
          className="btn btn-primary mt-6 w-full"
        >
          Try again
        </button>
        <PrivacyNote className="mx-auto mt-5" />
      </div>
    </div>
  );

  const renderCalibrating = () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12 animate-fade-in">
      {renderTrackingBanner()}
      <header className="text-center">
        <div className="mb-3 inline-flex items-center gap-2 text-brand-200">
          <EyeLogoIcon className="h-6 w-6" />
          <span className="text-sm font-semibold tracking-wide text-slate-300">
            EyeTrack
          </span>
        </div>
        <h1 className="text-3xl font-bold text-white">Let’s calibrate</h1>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          This teaches the demo where “looking at the ad” is for you. It takes
          just a moment.
        </p>
      </header>

      <CalibrationPanel
        videoRef={videoRef}
        faceDetected={gaze.gaze.faceDetected}
        quality={gaze.calibrationQuality}
        onCalibrate={handleCalibrate}
      />

      <WebcamPreview
        videoRef={videoRef}
        active={active}
        available={cameraAvailable}
        faceDetected={gaze.gaze.faceDetected}
        gazeX={gaze.metrics.gazeX}
        gazeY={gaze.metrics.gazeY}
        className="w-full max-w-xs"
      />

      <PrivacyNote />
    </div>
  );

  const renderWatchPage = () => (
    <div className="min-h-screen animate-fade-in">
      {/* Sticky top header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#070b14]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow-brand">
              <EyeLogoIcon className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">
              Eye<span className="text-gradient">Track</span>
            </span>
          </div>

          {/* Decorative search bar */}
          <div className="mx-auto hidden w-full max-w-md items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-400 md:flex">
            <SearchIcon className="h-4 w-4" />
            <input
              type="text"
              placeholder="Search"
              aria-label="Search (decorative)"
              className="w-full bg-transparent text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <PrivacyNote className="hidden lg:inline-flex" />
            <button
              type="button"
              onClick={recalibrate}
              className="btn btn-secondary"
              title="Recalibrate (press C or R)"
            >
              <RecalibrateIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Recalibrate</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {renderTrackingBanner()}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Main column — the ad player */}
          <div className="min-w-0">
            <AdPlayer
              key={`${ad.id}-${playerEpoch}`}
              ad={ad}
              playing={playing}
              paused={paused}
              pauseReason={pauseReason}
              status={status}
              onSkip={handleSkip}
              onAdEnded={handleAdEnded}
            />
          </div>

          {/* Sidebar — hidden on small screens */}
          <aside className="hidden flex-col gap-5 lg:flex">
            {/* Session stats */}
            <section className="glass-panel rounded-2xl p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-200">
                Session
              </h2>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs text-slate-400">Status</span>
                <StatusBadge status={status} />
              </div>
              <ConfidenceMeter
                confidence={gaze.gaze.confidence}
                className="mb-4"
              />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white/[0.04] p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <ClockIcon className="h-3.5 w-3.5" />
                    Watch time
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold text-white">
                    {formatWatchTime(watchTimeMs)}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.04] p-3">
                  <div className="text-xs text-slate-400">FPS</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-white">
                    {Math.round(gaze.fps)}
                  </div>
                </div>
              </div>
            </section>

            {/* Up next */}
            <section className="glass-panel rounded-2xl p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-200">
                Up next
              </h2>
              <ul className="flex flex-col gap-2">
                {upNext.map((creative) => {
                  const nextIndex = AD_CREATIVES.indexOf(creative);
                  return (
                    <li key={creative.id}>
                      <button
                        type="button"
                        onClick={() => goToAd(nextIndex)}
                        className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/[0.06]"
                      >
                        <span
                          className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded-lg text-2xl shadow-inner"
                          style={{
                            backgroundImage: `linear-gradient(135deg, ${creative.gradientFrom}, ${creative.gradientVia}, ${creative.gradientTo})`,
                          }}
                          aria-hidden="true"
                        >
                          {creative.glyph}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-100 group-hover:text-white">
                            {creative.product}
                          </span>
                          <span className="block truncate text-xs text-slate-400">
                            {creative.channel}
                          </span>
                          <span className="mt-0.5 inline-block chip bg-white/[0.06] text-[10px] text-slate-300">
                            {creative.category}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </aside>
        </div>
      </main>

      {/* Floating instruments */}
      <WebcamPreview
        videoRef={videoRef}
        active={active}
        available={cameraAvailable}
        faceDetected={gaze.gaze.faceDetected}
        gazeX={gaze.metrics.gazeX}
        gazeY={gaze.metrics.gazeY}
        className="fixed bottom-4 right-4 z-40 w-60"
      />

      <DebugPanel
        gaze={gaze.gaze}
        metrics={gaze.metrics}
        baseline={gaze.baseline}
        fps={gaze.fps}
        playing={playing}
        attentive={gaze.attentive}
        status={status}
        faceTrackingStatus={gaze.faceTrackingStatus}
        className="fixed bottom-4 left-4 z-40"
      />
    </div>
  );

  // -------------------------------------------------------------------------
  // Phase router.
  // -------------------------------------------------------------------------

  const renderPhase = (): JSX.Element => {
    if (phase === "error") {
      return renderError();
    }
    if (phase === "idle" || phase === "permission") {
      // While requesting permission we keep the consent hero up; the browser's
      // own permission prompt is the visible affordance.
      return <ConsentScreen onStart={handleStart} />;
    }
    if (phase === "calibrating") {
      return renderCalibrating();
    }
    // watching | paused
    return renderWatchPage();
  };

  return (
    <>
      {/*
       * The single shared webcam source. It is rendered once and kept mounted
       * for every webcam-backed phase so the stream is never dropped as the UI
       * transitions calibrating <-> watching <-> paused. It lives off-screen
       * (`tracking-video`); MediaPipe reads its frames and the visible previews
       * draw it onto their own canvases. Mounting it as soon as the session
       * leaves "idle" guarantees videoRef.current exists before the stream is
       * attached in useWebcam.start().
       */}
      {phase !== "idle" && (
        <video
          ref={videoRef}
          className="tracking-video"
          playsInline
          muted
          autoPlay
        />
      )}
      {renderPhase()}
    </>
  );
}

export default App;
