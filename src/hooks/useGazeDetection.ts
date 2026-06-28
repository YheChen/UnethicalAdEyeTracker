/**
 * useGazeDetection — the orchestrator that turns raw camera frames into the
 * play/pause signal that drives the ad.
 *
 * Pipeline per frame:
 *   useFaceTracking (MediaPipe) -> computeGazeMetrics -> MovingAverage smoothing
 *   -> evaluateGaze (vs calibration baseline) -> AttentionGate (grace window)
 *   -> `attentive` boolean (the thing the ad cares about).
 *
 * Performance contract:
 * - All per-frame work happens in refs (no React state churn on the hot path).
 * - We publish to React state at a throttled cadence (~14 Hz) so the UI updates
 *   smoothly without re-rendering on every animation frame, with ONE exception:
 *   whenever `attentive` flips we publish immediately, so play/pause is snappy.
 *
 * Attention smoothing: BLINK_LEEWAY_MS and ATTENTION_GRACE_MS are both 500ms.
 * A single grace window therefore covers BOTH natural blinks (eyes briefly
 * closed) and momentary tracking loss (a dropped frame / face out of view),
 * which keeps playback from flickering on every transient hiccup.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useFaceTracking } from "./useFaceTracking";
import type { FaceFrame, FaceTrackingStatus } from "./useFaceTracking";
import {
  computeGazeMetrics,
  estimateCalibrationQuality,
  evaluateGaze,
} from "../utils/gaze";
import { MovingAverage } from "../utils/smoothing";
import { AttentionGate, now } from "../utils/timers";
import {
  ATTENTION_GRACE_MS,
  GAZE_SMOOTHING_WINDOW,
} from "../utils/constants";
import type {
  CalibrationBaseline,
  GazeMetrics,
  GazeState,
} from "../types/gaze";

/** Detailed, lower-level signals surfaced for the debug/tuning panel. */
export interface DebugMetrics {
  gazeX: number;
  gazeY: number;
  eyeOpenness: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** Worst-axis normalized deviation from baseline (1 = at threshold). */
  deviation: number;
  /** Milliseconds since attention was last confirmed (Infinity before any). */
  msSinceValidGaze: number;
  /** Milliseconds of grace remaining before attention lapses (>= 0). */
  graceRemainingMs: number;
}

export interface UseGazeDetectionOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Run the pipeline only while true (calibrating / watching / paused). */
  active: boolean;
}

export interface UseGazeDetectionResult {
  gaze: GazeState;
  metrics: DebugMetrics;
  baseline: CalibrationBaseline | null;
  attentive: boolean;
  fps: number;
  /**
   * Live 0..1 estimate of how steady the gaze is right now (low jitter = high).
   * Drives the calibration-quality bar and gates the Calibrate button. It is 0
   * until a face is seen and the smoothing windows are full.
   */
  calibrationQuality: number;
  faceTrackingStatus: FaceTrackingStatus;
  faceTrackingError: string | null;
  /** Capture a baseline from the current smoothed metrics (null if unready). */
  calibrate: () => CalibrationBaseline | null;
  /** Forget the baseline and reset the smoothing/attention state. */
  resetCalibration: () => void;
}

// How often we may push fresh metrics to React state on the steady path.
// ~70ms => ~14 updates/sec, plenty smooth for the meters and debug readouts.
const PUBLISH_INTERVAL_MS = 70;

// Smoothing factor for the FPS exponential moving average (0..1, higher = more
// reactive). FPS is purely informational so a gentle, stable value is fine.
const FPS_SMOOTHING = 0.1;

/** Centred, no-signal defaults used before any face is seen / when no face. */
const NEUTRAL_GAZE_STATE: GazeState = {
  lookingAtAd: false,
  confidence: 0,
  eyesOpen: false,
  faceDetected: false,
};

const INITIAL_DEBUG_METRICS: DebugMetrics = {
  gazeX: 0,
  gazeY: 0,
  eyeOpenness: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  deviation: 0,
  msSinceValidGaze: 0,
  graceRemainingMs: ATTENTION_GRACE_MS,
};

export function useGazeDetection(
  opts: UseGazeDetectionOptions,
): UseGazeDetectionResult {
  const { videoRef, active } = opts;

  // ---- Published (React) state -------------------------------------------
  const [gaze, setGaze] = useState<GazeState>(NEUTRAL_GAZE_STATE);
  const [metrics, setMetrics] = useState<DebugMetrics>(INITIAL_DEBUG_METRICS);
  const [baseline, setBaseline] = useState<CalibrationBaseline | null>(null);
  const [attentive, setAttentive] = useState(false);
  const [fps, setFps] = useState(0);
  const [calibrationQuality, setCalibrationQuality] = useState(0);

  // ---- Hot-path state held in refs (no re-render on update) --------------
  // One smoothing window per signal we care about.
  const avgGazeX = useRef(new MovingAverage(GAZE_SMOOTHING_WINDOW));
  const avgGazeY = useRef(new MovingAverage(GAZE_SMOOTHING_WINDOW));
  const avgYaw = useRef(new MovingAverage(GAZE_SMOOTHING_WINDOW));
  const avgPitch = useRef(new MovingAverage(GAZE_SMOOTHING_WINDOW));
  const avgEyeOpenness = useRef(new MovingAverage(GAZE_SMOOTHING_WINDOW));

  // Latest smoothed roll (not smoothed via average — informational only).
  const rollRef = useRef(0);

  const baselineRef = useRef<CalibrationBaseline | null>(null);
  const gateRef = useRef(new AttentionGate());

  // Latest derived values, mirrored from the published state so calibrate()
  // and the publish throttle can read them synchronously.
  const gazeRef = useRef<GazeState>(NEUTRAL_GAZE_STATE);
  const metricsRef = useRef<DebugMetrics>(INITIAL_DEBUG_METRICS);
  const attentiveRef = useRef(false);
  const calibrationQualityRef = useRef(0);

  // Throttle + FPS bookkeeping.
  const lastPublishRef = useRef(0);
  const lastFrameTsRef = useRef<number | null>(null);
  const fpsRef = useRef(0);

  // Mirror `active` into a ref so onFrame can early-out without re-subscribing.
  const activeRef = useRef(active);
  activeRef.current = active;

  /**
   * Push the current ref snapshot into React state. Called on the throttle or
   * immediately when `attentive` flips.
   */
  const publish = useCallback(() => {
    setGaze(gazeRef.current);
    setMetrics(metricsRef.current);
    setAttentive(attentiveRef.current);
    setFps(fpsRef.current);
    setCalibrationQuality(calibrationQualityRef.current);
  }, []);

  /**
   * Per-frame callback from useFaceTracking. Kept stable via useCallback and
   * reading everything through refs, so a re-render never restarts the loop.
   */
  const onFrame = useCallback(
    (frame: FaceFrame) => {
      const t = now();

      // ---- FPS: EMA of instantaneous frame rate from timestamp deltas. ----
      const lastTs = lastFrameTsRef.current;
      if (lastTs !== null) {
        const delta = frame.timestamp - lastTs;
        if (delta > 0) {
          const instantaneous = 1000 / delta;
          fpsRef.current =
            fpsRef.current === 0
              ? instantaneous
              : fpsRef.current +
                FPS_SMOOTHING * (instantaneous - fpsRef.current);
        }
      }
      lastFrameTsRef.current = frame.timestamp;

      // If the pipeline is inactive we still tracked fps above, but we do not
      // touch gaze state or the attention gate.
      if (!activeRef.current) return;

      const previousAttentive = attentiveRef.current;

      let nextGaze: GazeState;
      let nextMetrics: DebugMetrics;

      if (!frame.faceDetected || !frame.landmarks) {
        // No face: do NOT feed the smoothing windows (would bias them toward
        // stale/centre values). This frame simply is not a confirmation.
        gateRef.current.update(false, t);
        // Cannot calibrate without a face in view.
        calibrationQualityRef.current = 0;

        const msSince = gateRef.current.msSinceConfirmed(t);
        nextGaze = {
          lookingAtAd: false,
          confidence: 0,
          eyesOpen: false,
          faceDetected: false,
        };
        nextMetrics = {
          // Retain last smoothed pose/gaze for continuity in the debug view.
          gazeX: avgGazeX.current.mean,
          gazeY: avgGazeY.current.mean,
          eyeOpenness: avgEyeOpenness.current.mean,
          yaw: avgYaw.current.mean,
          pitch: avgPitch.current.mean,
          roll: rollRef.current,
          deviation: Infinity,
          msSinceValidGaze: msSince,
          graceRemainingMs: Math.max(
            0,
            ATTENTION_GRACE_MS - (Number.isFinite(msSince) ? msSince : ATTENTION_GRACE_MS),
          ),
        };
      } else {
        // Face present: measure, smooth, and evaluate against the baseline.
        const raw: GazeMetrics = computeGazeMetrics(
          frame.landmarks,
          frame.matrix ?? undefined,
        );

        const smoothed: GazeMetrics = {
          gazeX: avgGazeX.current.push(raw.gazeX),
          gazeY: avgGazeY.current.push(raw.gazeY),
          eyeOpenness: avgEyeOpenness.current.push(raw.eyeOpenness),
          yaw: avgYaw.current.push(raw.yaw),
          pitch: avgPitch.current.push(raw.pitch),
          roll: raw.roll,
        };
        rollRef.current = raw.roll;

        // Live calibration steadiness: only meaningful once the smoothing
        // windows are full (otherwise std-dev is artificially tiny). Gates the
        // Calibrate button, which mirrors the readiness check in calibrate().
        const windowsReady =
          avgGazeX.current.isFull && avgGazeY.current.isFull;
        calibrationQualityRef.current = windowsReady
          ? estimateCalibrationQuality(
              avgGazeX.current.standardDeviation,
              avgGazeY.current.standardDeviation,
              avgYaw.current.standardDeviation,
              avgPitch.current.standardDeviation,
            )
          : 0;

        const evaluation = evaluateGaze(smoothed, baselineRef.current);

        // A confirmation requires a face, open eyes, and an on-target gaze.
        const confirmed =
          frame.faceDetected && evaluation.eyesOpen && evaluation.lookingAtAd;
        gateRef.current.update(confirmed, t);

        const msSince = gateRef.current.msSinceConfirmed(t);
        nextGaze = {
          lookingAtAd: confirmed,
          confidence: evaluation.confidence,
          eyesOpen: evaluation.eyesOpen,
          faceDetected: true,
        };
        nextMetrics = {
          gazeX: smoothed.gazeX,
          gazeY: smoothed.gazeY,
          eyeOpenness: smoothed.eyeOpenness,
          yaw: smoothed.yaw,
          pitch: smoothed.pitch,
          roll: smoothed.roll,
          deviation: evaluation.deviation,
          msSinceValidGaze: msSince,
          graceRemainingMs: Math.max(
            0,
            ATTENTION_GRACE_MS -
              (Number.isFinite(msSince) ? msSince : ATTENTION_GRACE_MS),
          ),
        };
      }

      // Grace window: stay attentive for up to ATTENTION_GRACE_MS after the
      // last confirmation (covers blinks + brief tracking loss).
      const nextAttentive = gateRef.current.isAttentive(t, ATTENTION_GRACE_MS);

      // Commit to refs.
      gazeRef.current = nextGaze;
      metricsRef.current = nextMetrics;
      attentiveRef.current = nextAttentive;

      // Publish immediately when attention flips (responsive play/pause),
      // otherwise respect the throttle to keep render pressure low.
      const flipped = nextAttentive !== previousAttentive;
      if (flipped || t - lastPublishRef.current >= PUBLISH_INTERVAL_MS) {
        lastPublishRef.current = t;
        publish();
      }
    },
    [publish],
  );

  // Drive the MediaPipe detection loop; enabled tracks `active`.
  const { status: faceTrackingStatus, error: faceTrackingError } =
    useFaceTracking({ videoRef, enabled: active, onFrame });

  /**
   * Reset the smoothing windows, attention gate, fps/throttle bookkeeping, and
   * the live gaze snapshot back to neutral. Does NOT clear the baseline.
   */
  const resetPipeline = useCallback(() => {
    avgGazeX.current.reset();
    avgGazeY.current.reset();
    avgYaw.current.reset();
    avgPitch.current.reset();
    avgEyeOpenness.current.reset();
    rollRef.current = 0;
    gateRef.current.reset();

    gazeRef.current = NEUTRAL_GAZE_STATE;
    metricsRef.current = INITIAL_DEBUG_METRICS;
    attentiveRef.current = false;
    calibrationQualityRef.current = 0;
    lastPublishRef.current = 0;
    lastFrameTsRef.current = null;
    fpsRef.current = 0;

    setGaze(NEUTRAL_GAZE_STATE);
    setMetrics(INITIAL_DEBUG_METRICS);
    setAttentive(false);
    setFps(0);
    setCalibrationQuality(0);
  }, []);

  // When the session activates/deactivates, reset the gate so a fresh run does
  // not inherit a stale "attentive" state from a previous session.
  useEffect(() => {
    if (active) {
      resetPipeline();
    } else {
      // Going inactive: drop attention so the ad does not appear to be playing.
      gateRef.current.reset();
      attentiveRef.current = false;
      setAttentive(false);
      calibrationQualityRef.current = 0;
      setCalibrationQuality(0);
    }
  }, [active, resetPipeline]);

  /**
   * Capture a calibration baseline from the current smoothed metrics.
   * Returns null if there is no live face or the smoothing windows are not yet
   * full (which would yield an unreliable, jittery baseline).
   */
  const calibrate = useCallback((): CalibrationBaseline | null => {
    if (!gazeRef.current.faceDetected) return null;
    if (!avgGazeX.current.isFull || !avgGazeY.current.isFull) return null;

    const quality = estimateCalibrationQuality(
      avgGazeX.current.standardDeviation,
      avgGazeY.current.standardDeviation,
      avgYaw.current.standardDeviation,
      avgPitch.current.standardDeviation,
    );

    const captured: CalibrationBaseline = {
      gazeX: avgGazeX.current.mean,
      gazeY: avgGazeY.current.mean,
      yaw: avgYaw.current.mean,
      pitch: avgPitch.current.mean,
      quality,
      capturedAt: now(),
    };

    baselineRef.current = captured;
    setBaseline(captured);

    // Start the session attentive: the user is, by definition, looking now.
    gateRef.current.prime(now());
    attentiveRef.current = true;
    setAttentive(true);

    return captured;
  }, []);

  /** Discard the baseline and reset the smoothing/attention pipeline. */
  const resetCalibration = useCallback(() => {
    baselineRef.current = null;
    setBaseline(null);
    resetPipeline();
  }, [resetPipeline]);

  return {
    gaze,
    metrics,
    baseline,
    attentive,
    fps,
    calibrationQuality,
    faceTrackingStatus,
    faceTrackingError,
    calibrate,
    resetCalibration,
  };
}

export default useGazeDetection;
