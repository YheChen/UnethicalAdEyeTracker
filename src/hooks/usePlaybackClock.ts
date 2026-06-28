/**
 * A play/pause-able clock that only advances while `playing` is true.
 *
 * The advertisement's progress should track the viewer's attention, not the
 * wall clock — so this hook accumulates elapsed seconds from
 * requestAnimationFrame deltas, but only during frames where playback is
 * active. When paused, the accumulator simply stops growing; when resumed, it
 * picks up exactly where it left off (the gap is discarded, never counted).
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseAdClockResult {
  /** Elapsed playback time in seconds, clamped to [0, durationSec]. */
  currentTime: number;
  /** Fraction of the ad completed, 0..1. */
  progress: number;
  /** Whether playback has reached the end. */
  ended: boolean;
  /** Rewind to the beginning and clear the ended flag. */
  reset: () => void;
}

export function useAdClock(
  durationSec: number,
  playing: boolean,
  onEnded?: () => void,
): UseAdClockResult {
  // The authoritative elapsed time lives in a ref so the rAF loop can mutate it
  // every frame without forcing a React re-render on every tick.
  const elapsedRef = useRef(0);
  // Timestamp of the previous animated frame; null whenever the loop is idle.
  const lastFrameRef = useRef<number | null>(null);
  // Guards onEnded so it fires exactly once per playthrough.
  const endedFiredRef = useRef(false);

  // Keep the latest onEnded in a ref so changing the callback identity does not
  // tear down and recreate the animation loop.
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const [currentTime, setCurrentTime] = useState(0);
  const [ended, setEnded] = useState(false);
  // Bumped by reset() to force the animation effect to tear down and restart.
  // The loop self-terminates when the ad ends (see `tick`), so on Replay neither
  // `playing` nor `durationSec` changes — without this token the effect would
  // never re-run and the clock would stay frozen at 0.
  const [runToken, setRunToken] = useState(0);

  const reset = useCallback(() => {
    elapsedRef.current = 0;
    lastFrameRef.current = null;
    endedFiredRef.current = false;
    setCurrentTime(0);
    setEnded(false);
    setRunToken((t) => t + 1);
  }, []);

  // A new ad (different duration) is effectively a fresh clock: reset state and
  // the accumulator so progress is measured against the new length.
  useEffect(() => {
    elapsedRef.current = 0;
    lastFrameRef.current = null;
    endedFiredRef.current = false;
    setCurrentTime(0);
    setEnded(false);
  }, [durationSec]);

  useEffect(() => {
    // While paused (or already finished) the clock is dormant: no rAF loop, and
    // we drop the last-frame timestamp so the paused interval is not counted as
    // elapsed time when playback resumes.
    if (!playing) {
      lastFrameRef.current = null;
      return;
    }

    let rafId = 0;

    const tick = (timestamp: number) => {
      // First animated frame after a (re)start: establish the time origin but
      // do not advance — there is no prior frame to diff against yet.
      if (lastFrameRef.current === null) {
        lastFrameRef.current = timestamp;
      } else {
        const deltaSec = (timestamp - lastFrameRef.current) / 1000;
        lastFrameRef.current = timestamp;

        const next = Math.min(
          durationSec,
          Math.max(0, elapsedRef.current + deltaSec),
        );
        elapsedRef.current = next;
        setCurrentTime(next);

        if (next >= durationSec) {
          if (!endedFiredRef.current) {
            endedFiredRef.current = true;
            setEnded(true);
            onEndedRef.current?.();
          }
          // Stop the loop at the end; reset() restarts it if replayed.
          return;
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      // Forget the frame origin so resuming starts a clean delta.
      lastFrameRef.current = null;
    };
  }, [playing, durationSec, runToken]);

  const progress = durationSec > 0 ? currentTime / durationSec : 0;

  return { currentTime, progress, ended, reset };
}

export default useAdClock;
