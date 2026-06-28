/**
 * Shared types for the gaze-tracking pipeline.
 *
 * The pipeline flows: raw MediaPipe landmarks -> {@link GazeMetrics} (per-frame
 * geometric measurements) -> compared against a {@link CalibrationBaseline} ->
 * a smoothed, user-facing {@link GazeState}.
 */

/** High-level, smoothed gaze result consumed by the UI and playback logic. */
export interface GazeState {
  /** Whether the user appears to be looking at the advertisement. */
  lookingAtAd: boolean;
  /** 0..1 quality/centeredness score. Higher = more confidently on-target. */
  confidence: number;
  /** Whether the eyes are currently open (false during a blink). */
  eyesOpen: boolean;
  /** Whether a face is currently detected in the frame. */
  faceDetected: boolean;
}

/**
 * Raw per-frame geometric measurements derived from the face landmarks.
 * These are calibration-relative signals — absolute values are only meaningful
 * when compared against a captured {@link CalibrationBaseline}.
 */
export interface GazeMetrics {
  /** Normalized horizontal iris position within the eye (~0.5 = centered). */
  gazeX: number;
  /** Normalized vertical iris position within the eye (~0.5 = centered). */
  gazeY: number;
  /** Eye-aspect-ratio style openness measure (higher = more open). */
  eyeOpenness: number;
  /** Approximate head yaw in degrees (turn left/right). */
  yaw: number;
  /** Approximate head pitch in degrees (look up/down). */
  pitch: number;
  /** Approximate head roll in degrees (tilt). */
  roll: number;
}

/**
 * The reference reading captured when the user looks at the centre of the ad.
 * All live gaze decisions are made relative to this baseline.
 */
export interface CalibrationBaseline {
  gazeX: number;
  gazeY: number;
  yaw: number;
  pitch: number;
  /** 0..1 stability estimate for the captured sample (low jitter = high). */
  quality: number;
  /** High-resolution timestamp (performance.now) when captured. */
  capturedAt: number;
}

/** The macro state machine that drives the overall demo flow. */
export type DemoState =
  | "idle"
  | "permission"
  | "calibrating"
  | "watching"
  | "paused"
  | "error";
