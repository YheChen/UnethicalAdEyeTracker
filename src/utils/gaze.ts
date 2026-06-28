/**
 * Pure gaze math: convert raw MediaPipe face landmarks into geometric gaze
 * metrics, then decide whether the user is looking at the advertisement
 * relative to a captured calibration baseline.
 *
 * All functions here are side-effect free and deterministic so they can be
 * unit-tested and called freely from the per-frame detection loop.
 */

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { clamp01, distance2D } from "./smoothing";
import { matrixToHeadPose } from "./headPose";
import {
  EYE_OPEN_EAR_THRESHOLD,
  GAZE_RATIO_THRESHOLD_X,
  GAZE_RATIO_THRESHOLD_Y,
  HEAD_PITCH_THRESHOLD_DEG,
  HEAD_YAW_THRESHOLD_DEG,
  MIN_CONFIDENCE,
} from "./constants";
import type {
  CalibrationBaseline,
  GazeMetrics,
} from "../types/gaze";

// ---------------------------------------------------------------------------
// Landmark indices (MediaPipe Face Landmarker, 478-point mesh with iris)
// ---------------------------------------------------------------------------

/** Left eye: outer corner, inner corner, upper lid, lower lid, iris centre. */
const LEFT_EYE = {
  outer: 33,
  inner: 133,
  topLid: 159,
  botLid: 145,
  iris: 468,
} as const;

/** Right eye: outer corner, inner corner, upper lid, lower lid, iris centre. */
const RIGHT_EYE = {
  outer: 263,
  inner: 362,
  topLid: 386,
  botLid: 374,
  iris: 473,
} as const;

/** Below this the iris model is unavailable / mesh is incomplete. */
const REQUIRED_LANDMARK_COUNT = 478;

/** Denominators smaller than this are treated as degenerate. */
const MIN_DENOMINATOR = 1e-6;

// Safe centred fallbacks used when the mesh is missing or incomplete.
const FALLBACK_GAZE = 0.5;
const FALLBACK_EYE_OPENNESS = 0.3;

/**
 * Horizontal iris ratio within one eye: 0 at the outer corner, 1 at the inner
 * corner. A guard returns the centred value (0.5) when the eye spans almost no
 * horizontal distance (e.g. an extreme head turn or a tracking glitch).
 */
function horizontalIrisRatio(
  iris: NormalizedLandmark,
  outer: NormalizedLandmark,
  inner: NormalizedLandmark,
): number {
  const denom = inner.x - outer.x;
  if (Math.abs(denom) < MIN_DENOMINATOR) return FALLBACK_GAZE;
  return (iris.x - outer.x) / denom;
}

/**
 * Vertical iris ratio within one eye: 0 at the upper lid, 1 at the lower lid.
 * Guarded identically to the horizontal ratio.
 */
function verticalIrisRatio(
  iris: NormalizedLandmark,
  topLid: NormalizedLandmark,
  botLid: NormalizedLandmark,
): number {
  const denom = botLid.y - topLid.y;
  if (Math.abs(denom) < MIN_DENOMINATOR) return FALLBACK_GAZE;
  return (iris.y - topLid.y) / denom;
}

/**
 * Eye-aspect-ratio style openness: lid separation normalized by eye width.
 * Higher means more open; a near-zero eye width is guarded to avoid blow-up.
 */
function eyeAspectRatio(
  topLid: NormalizedLandmark,
  botLid: NormalizedLandmark,
  outer: NormalizedLandmark,
  inner: NormalizedLandmark,
): number {
  const width = distance2D(outer.x, outer.y, inner.x, inner.y);
  if (width < MIN_DENOMINATOR) return FALLBACK_EYE_OPENNESS;
  const lidGap = distance2D(topLid.x, topLid.y, botLid.x, botLid.y);
  return lidGap / width;
}

/**
 * Derive per-frame gaze metrics from face landmarks and the head-pose matrix.
 *
 * The iris ratios are averaged across both eyes to reduce noise. If the mesh is
 * incomplete (fewer than 478 points, i.e. no iris landmarks) we fall back to
 * safe centred values but still report the head pose, which is matrix-derived
 * and independent of the iris points.
 */
export function computeGazeMetrics(
  landmarks: NormalizedLandmark[],
  matrix: number[] | undefined,
): GazeMetrics {
  const pose = matrixToHeadPose(matrix);

  if (!landmarks || landmarks.length < REQUIRED_LANDMARK_COUNT) {
    return {
      gazeX: FALLBACK_GAZE,
      gazeY: FALLBACK_GAZE,
      eyeOpenness: FALLBACK_EYE_OPENNESS,
      yaw: pose.yaw,
      pitch: pose.pitch,
      roll: pose.roll,
    };
  }

  const leftIris = landmarks[LEFT_EYE.iris];
  const leftOuter = landmarks[LEFT_EYE.outer];
  const leftInner = landmarks[LEFT_EYE.inner];
  const leftTop = landmarks[LEFT_EYE.topLid];
  const leftBot = landmarks[LEFT_EYE.botLid];

  const rightIris = landmarks[RIGHT_EYE.iris];
  const rightOuter = landmarks[RIGHT_EYE.outer];
  const rightInner = landmarks[RIGHT_EYE.inner];
  const rightTop = landmarks[RIGHT_EYE.topLid];
  const rightBot = landmarks[RIGHT_EYE.botLid];

  // Average the two eyes for a steadier, more symmetric reading.
  const gazeX =
    (horizontalIrisRatio(leftIris, leftOuter, leftInner) +
      horizontalIrisRatio(rightIris, rightOuter, rightInner)) /
    2;

  const gazeY =
    (verticalIrisRatio(leftIris, leftTop, leftBot) +
      verticalIrisRatio(rightIris, rightTop, rightBot)) /
    2;

  const eyeOpenness =
    (eyeAspectRatio(leftTop, leftBot, leftOuter, leftInner) +
      eyeAspectRatio(rightTop, rightBot, rightOuter, rightInner)) /
    2;

  return {
    gazeX,
    gazeY,
    eyeOpenness,
    yaw: pose.yaw,
    pitch: pose.pitch,
    roll: pose.roll,
  };
}

/** Result of comparing live metrics against the calibration baseline. */
export interface GazeEvaluation {
  /** Whether the user is judged to be looking at the ad. */
  lookingAtAd: boolean;
  /** 0..1 confidence: 1 at the calibrated centre, 0.5 at a threshold edge. */
  confidence: number;
  /** Whether the eyes are open (not mid-blink). */
  eyesOpen: boolean;
  /** Normalized worst-axis deviation from baseline (1 = at threshold). */
  deviation: number;
}

/**
 * Decide whether the user is looking at the ad given smoothed metrics and the
 * calibration baseline.
 *
 * Deviation is measured per axis (iris X/Y and head yaw/pitch) normalized by
 * that axis's tolerance, then the worst (largest) axis dominates — looking away
 * along any single axis is enough to count as off-target. Confidence falls
 * linearly from 1 at the centre to 0.5 at the threshold edge.
 */
export function evaluateGaze(
  metrics: GazeMetrics,
  baseline: CalibrationBaseline | null,
): GazeEvaluation {
  const eyesOpen = metrics.eyeOpenness > EYE_OPEN_EAR_THRESHOLD;

  // Without a baseline we have no frame of reference, so we cannot judge gaze.
  if (!baseline) {
    return {
      lookingAtAd: false,
      confidence: 0,
      eyesOpen,
      deviation: Infinity,
    };
  }

  const deviation = Math.max(
    Math.abs(metrics.gazeX - baseline.gazeX) / GAZE_RATIO_THRESHOLD_X,
    Math.abs(metrics.gazeY - baseline.gazeY) / GAZE_RATIO_THRESHOLD_Y,
    Math.abs(metrics.yaw - baseline.yaw) / HEAD_YAW_THRESHOLD_DEG,
    Math.abs(metrics.pitch - baseline.pitch) / HEAD_PITCH_THRESHOLD_DEG,
  );

  const confidence = clamp01(1 - 0.5 * deviation);
  const lookingAtAd = eyesOpen && confidence >= MIN_CONFIDENCE;

  return { lookingAtAd, confidence, eyesOpen, deviation };
}

/**
 * Map per-axis jitter (standard deviations gathered over the calibration
 * window) to a 0..1 stability score. Each axis's jitter is normalized by a
 * tolerance, summed, averaged across the four axes, and inverted so that a
 * perfectly still sample scores 1 and a noisy one trends toward 0.
 */
export function estimateCalibrationQuality(
  stdGazeX: number,
  stdGazeY: number,
  stdYaw: number,
  stdPitch: number,
): number {
  const jitter =
    (stdGazeX / 0.02 + stdGazeY / 0.025 + stdYaw / 2 + stdPitch / 2) / 4;
  return clamp01(1 - jitter);
}
