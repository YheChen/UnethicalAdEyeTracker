/**
 * AdPlayer — the centerpiece YouTube-style advertisement player.
 *
 * It is self-contained: it owns its playback clock, ambient audio + mute state,
 * fullscreen toggle, skip countdown and replay. The clock only advances while
 * `playing` is true, so ad progress strictly follows the viewer's attention.
 *
 * Layout: a 16:9 relative stage renders the animated creative scene + YouTube
 * chrome, with the {@link PauseOverlay} layered inside the same relative box so
 * its backdrop-blur blurs the ad. Below the stage sits the watch-page metadata
 * (title, channel row, action row).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdClock } from "../hooks/usePlaybackClock";
import PauseOverlay from "./PauseOverlay";
import StatusBadge from "./StatusBadge";
import type { StatusKind } from "./StatusBadge";
import type { AdCreative } from "../data/creatives";

export interface AdPlayerProps {
  ad: AdCreative;
  /** Ad should play (user is attentive AND session active). */
  playing: boolean;
  /** Session active but not attentive -> show overlay. */
  paused: boolean;
  pauseReason: "look-away" | "no-face";
  status: StatusKind;
  /** User/affordance skips to next ad. */
  onSkip: () => void;
  /** Ad finished. */
  onAdEnded: () => void;
}

/** Seconds of elapsed playback before the "Skip Ad" button unlocks. */
const SKIP_UNLOCK_SEC = 5;
/** Quietest-possible ambient tone gain; well below anything intrusive. */
const AMBIENT_GAIN = 0.04;

/** Format a number of seconds as m:ss. */
function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Deterministic, believable fake subscriber count derived from the ad id. */
function fakeSubscribers(ad: AdCreative): string {
  let hash = 0;
  for (let i = 0; i < ad.id.length; i += 1) {
    hash = (hash * 31 + ad.id.charCodeAt(i)) >>> 0;
  }
  const millions = 1 + (hash % 40) / 10; // 1.0 .. 4.9
  return `${millions.toFixed(1)}M subscribers`;
}

// ---------------------------------------------------------------------------
// Inline icons (no icon library installed)
// ---------------------------------------------------------------------------

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M4 9v6h4l5 5V4L8 9H4zM16.5 12l2.5 2.5-1 1L15.5 13l-2.5 2.5-1-1L14.5 12 12 9.5l1-1 2.5 2.5L18 8.5l1 1z" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M4 9v6h4l5 5V4L8 9H4zm12.5 3a4.5 4.5 0 00-2.5-4.03v8.05A4.5 4.5 0 0016.5 12zM14 3.23v2.06a7 7 0 010 13.42v2.06a9 9 0 000-17.54z" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 00.12-.64l-2-3.46a.5.5 0 00-.61-.22l-2.49 1a7.03 7.03 0 00-1.69-.98l-.38-2.65A.49.49 0 0014 2h-4a.49.49 0 00-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 00-.61.22l-2 3.46a.5.5 0 00.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 00-.12.64l2 3.46c.14.24.43.34.69.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.49.42h4c.24 0 .45-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.26.12.55.02.69-.22l2-3.46a.5.5 0 00-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z" />
    </svg>
  );
}

function SkipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  );
}

function LikeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M1 21h4V9H1v12zM23 10a2 2 0 00-2-2h-6.31l.95-4.57.03-.32a1.5 1.5 0 00-.44-1.06L14.17 1 7.59 7.59A2 2 0 007 9v10a2 2 0 002 2h9a2 2 0 001.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
    </svg>
  );
}

function DislikeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M19 15h4V3h-4v12zM1 14a2 2 0 002 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59A2 2 0 0017 15V5a2 2 0 00-2-2H6a2 2 0 00-1.84 1.22L1.14 11.27c-.09.23-.14.47-.14.73v2z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 1015 5c0 .24.04.47.09.7L8.04 9.81A3 3 0 109 14.19l7.12 4.16c-.05.21-.08.43-.08.65A2.92 2.92 0 1018 16.08z" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zM2 16h8v-2H2v2zm14-4v6l5-3-5-3z" />
    </svg>
  );
}

export function AdPlayer(props: AdPlayerProps): JSX.Element {
  const { ad, playing, paused, pauseReason, status, onSkip, onAdEnded } = props;

  // The clock only advances while `playing`, so progress follows attention.
  const clock = useAdClock(ad.durationSec, playing, onAdEnded);

  const containerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Lazily-created Web Audio graph for the very subtle ambient tone.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const remainingSeconds = Math.max(0, Math.ceil(ad.durationSec - clock.currentTime));
  const skipUnlocked = clock.currentTime >= SKIP_UNLOCK_SEC;
  const skipCountdown = Math.max(1, Math.ceil(SKIP_UNLOCK_SEC - clock.currentTime));

  // Inline gradient for the animated background; `background-size:200%` lets the
  // `animate-gradient-pan` keyframes pan the gradient for a living-commercial feel.
  const gradientStyle = useMemo(
    () => ({
      backgroundImage: `linear-gradient(120deg, ${ad.gradientFrom}, ${ad.gradientVia}, ${ad.gradientTo})`,
      backgroundSize: "200% 200%",
    }),
    [ad.gradientFrom, ad.gradientVia, ad.gradientTo],
  );

  // When not playing, freeze every CSS animation in the scene.
  const freeze = playing ? "" : "animation-paused";

  // -------------------------------------------------------------------------
  // Ambient audio: only audible while `playing && !muted`. Created lazily on
  // the first unmuted play (a user gesture has occurred by then). Kept quiet.
  // -------------------------------------------------------------------------
  const ensureAudio = useCallback(() => {
    if (audioCtxRef.current) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // environment without Web Audio — silently skip.

    const ctx = new Ctor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 220; // gentle low tone
    gain.gain.value = 0; // start silent; raised when allowed to sound
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();

    audioCtxRef.current = ctx;
    oscillatorRef.current = oscillator;
    gainRef.current = gain;
  }, []);

  useEffect(() => {
    const shouldSound = playing && !muted;
    if (!shouldSound) {
      // Ramp to silence if the graph already exists; never create it just to mute.
      const gain = gainRef.current;
      const ctx = audioCtxRef.current;
      if (gain && ctx) {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      }
      return;
    }

    ensureAudio();
    const ctx = audioCtxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;
    // Some browsers start the context suspended until a gesture resumes it.
    void ctx.resume();
    gain.gain.setTargetAtTime(AMBIENT_GAIN, ctx.currentTime, 0.08);
  }, [playing, muted, ensureAudio]);

  // Tear down the audio graph on unmount.
  useEffect(() => {
    return () => {
      try {
        oscillatorRef.current?.stop();
      } catch {
        // Oscillator may already be stopped; ignore.
      }
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
      oscillatorRef.current = null;
      gainRef.current = null;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Fullscreen — toggled on the player container, with null guards.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (node.requestFullscreen) {
      void node.requestFullscreen();
    }
  }, []);

  const subscriberLabel = useMemo(() => fakeSubscribers(ad), [ad]);
  const videoTitle = `${ad.product} — ${ad.tagline}`;

  return (
    <section className="animate-fade-in">
      {/* ---------------------------------------------------------------- */}
      {/* 16:9 player stage                                                */}
      {/* ---------------------------------------------------------------- */}
      <div
        ref={containerRef}
        className="group relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-glass"
      >
        {/* Animated gradient background */}
        <div
          className={`absolute inset-0 animate-gradient-pan transition-all duration-500 ${freeze} ${
            paused ? "scale-105 brightness-[0.6]" : "scale-100 brightness-100"
          }`}
          style={gradientStyle}
        />

        {/* Soft vignette + grid texture for depth */}
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

        {/* Creative content: glyph + copy */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center px-6 text-center transition-all duration-500 ${
            paused ? "scale-95 opacity-90" : "scale-100 opacity-100"
          }`}
        >
          <div
            className={`mb-3 select-none text-7xl drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] animate-float sm:text-8xl ${freeze}`}
            aria-hidden="true"
          >
            {ad.glyph}
          </div>
          <div className={`animate-fade-in-up ${freeze}`}>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/80 sm:text-sm">
              {ad.brand}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold text-white drop-shadow sm:text-4xl">
              {ad.product}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/90 sm:text-base">
              {ad.tagline}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <span
                className="rounded-lg px-3 py-1.5 text-lg font-extrabold text-white shadow-lg"
                style={{ backgroundColor: ad.accent }}
              >
                {ad.price}
              </span>
              <span className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">
                {ad.cta}
              </span>
            </div>
          </div>
        </div>

        {/* Top-left: yellow Ad badge + remaining seconds */}
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[11px] font-bold uppercase text-black">
            Ad
          </span>
          <span className="rounded bg-black/55 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur">
            {remainingSeconds}s
          </span>
        </div>

        {/* Top-right: live status badge */}
        <div className="absolute right-3 top-3">
          <StatusBadge status={status} />
        </div>

        {/* Skip Ad affordance, above the bottom chrome */}
        <div className="absolute bottom-16 right-3 z-20">
          {skipUnlocked ? (
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex items-center gap-2 rounded-md border border-white/30 bg-black/55 px-3 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-black/75"
              aria-label="Skip advertisement"
            >
              Skip Ad
              <SkipIcon />
            </button>
          ) : (
            <span
              className="inline-flex cursor-not-allowed items-center rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm font-medium text-white/70 backdrop-blur"
              aria-label={`Skip available in ${skipCountdown} seconds`}
            >
              Skip Ad in {skipCountdown}
            </span>
          )}
        </div>

        {/* Bottom chrome: control row + YouTube-style progress bar */}
        <div className="absolute inset-x-0 bottom-0 z-20">
          <div className="flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-white">
            {/* Play/pause glyph — gaze-controlled, hence the explanatory title. */}
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/90"
              title="Playback follows your gaze"
              aria-label={playing ? "Playing (gaze-controlled)" : "Paused (gaze-controlled)"}
              role="img"
            >
              {playing ? <PlayIcon /> : <PauseIcon />}
            </span>

            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15"
              aria-label={muted ? "Unmute" : "Mute"}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MutedIcon /> : <VolumeIcon />}
            </button>

            <span className="text-xs tabular-nums text-white/90">
              {formatTime(clock.currentTime)} / {formatTime(ad.durationSec)}
            </span>

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15"
                aria-label="Settings"
                title="Settings"
              >
                <SettingsIcon />
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15"
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
              </button>
            </div>
          </div>

          {/* Thin progress bar: yellow fill over a faint track. */}
          <div className="h-1 w-full bg-white/25">
            <div
              className="h-full bg-yellow-500 transition-[width] duration-150 ease-linear"
              style={{ width: `${clock.progress * 100}%` }}
            />
          </div>
        </div>

        {/* Pause overlay — inside the relative container so its blur hits the ad. */}
        <PauseOverlay visible={paused} reason={pauseReason} />

        {/* End card over the scene when the clock finishes. */}
        {clock.ended && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-md animate-fade-in">
            <p className="text-lg font-semibold text-white">That's a wrap</p>
            <p className="-mt-2 text-sm text-white/70">Thanks for watching {ad.brand}.</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => clock.reset()}
              >
                Replay
              </button>
              <button type="button" className="btn btn-secondary" onClick={onSkip}>
                Next ad
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Watch-page metadata below the stage                              */}
      {/* ---------------------------------------------------------------- */}
      <h1 className="mt-4 text-lg font-bold text-white sm:text-xl">{videoTitle}</h1>

      {/* Channel row */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl shadow-inner"
            style={{ backgroundColor: ad.accent }}
            aria-hidden="true"
          >
            {ad.glyph}
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">{ad.channel}</p>
            <p className="text-xs text-slate-400">{subscriberLabel}</p>
          </div>
        </div>
        <button type="button" className="btn btn-secondary ml-1 rounded-full">
          Subscribe
        </button>

        {/* Action row */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-full bg-white/10">
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/15"
              aria-label="Like"
            >
              <LikeIcon />
              <span className="hidden sm:inline">Like</span>
            </button>
            <span className="h-5 w-px bg-white/15" />
            <button
              type="button"
              className="px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/15"
              aria-label="Dislike"
            >
              <DislikeIcon />
            </button>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/15"
            aria-label="Share"
          >
            <ShareIcon />
            <span className="hidden sm:inline">Share</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/15"
            aria-label="Save"
          >
            <SaveIcon />
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </div>

      {/* Description card mimicking a YouTube watch page */}
      <div className="glass-soft mt-3 rounded-xl p-3 text-sm text-slate-300">
        <p className="font-medium text-slate-200">
          {ad.category} · Sponsored
        </p>
        <p className="mt-1">{ad.description}</p>
      </div>
    </section>
  );
}

export default AdPlayer;
