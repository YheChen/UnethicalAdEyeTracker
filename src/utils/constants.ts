/**
 * Centralised, tunable configuration for the gaze-tracking demo.
 * Every threshold lives here so the experience can be calibrated without
 * hunting through the codebase. Values are also surfaced in the debug panel.
 */

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/**
 * How long the user may have their eyes closed (a blink) or be briefly
 * untracked before it counts against attention. Blinks are shorter than this.
 */
export const BLINK_LEEWAY_MS = 500;

/**
 * How long the user may look away — or tracking may be lost — before the
 * advertisement pauses. This is the headline "0.5 second" rule.
 */
export const ATTENTION_GRACE_MS = 500;

// ---------------------------------------------------------------------------
// Smoothing
// ---------------------------------------------------------------------------

/** Number of frames averaged together to damp per-frame gaze jitter. */
export const GAZE_SMOOTHING_WINDOW = 5;

// ---------------------------------------------------------------------------
// Gaze acceptance
// ---------------------------------------------------------------------------

/**
 * Minimum confidence (0..1) required to treat the user as looking at the ad.
 * Confidence falls off as the gaze drifts away from the calibrated centre, so a
 * higher value pauses the ad more readily (the gaze must stay closer to centre).
 * Currently set to 0.75 for testing — raise/lower to tune sensitivity.
 */
export const MIN_CONFIDENCE = 0.75;

// These four thresholds define the size of the "looking at the ad" cone around
// the calibrated centre. SMALLER = tighter perimeter = pauses more readily when
// the gaze drifts toward the screen edges/corners. Tightened for testing.

/** Maximum horizontal iris drift (normalized) from baseline before off-target. */
export const GAZE_RATIO_THRESHOLD_X = 0.1;

/** Maximum vertical iris drift (normalized) from baseline before off-target. */
export const GAZE_RATIO_THRESHOLD_Y = 0.11;

/** Maximum head yaw deviation (degrees) from baseline before off-target. */
export const HEAD_YAW_THRESHOLD_DEG = 14;

/** Maximum head pitch deviation (degrees) from baseline before off-target. */
export const HEAD_PITCH_THRESHOLD_DEG = 10;

// ---------------------------------------------------------------------------
// Eye openness
// ---------------------------------------------------------------------------

/** Eye-aspect-ratio below which an eye is considered closed (blink). */
export const EYE_OPEN_EAR_THRESHOLD = 0.16;

/** MediaPipe blink-blendshape score above which an eye is considered closed. */
export const BLINK_BLENDSHAPE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

/** Minimum calibration stability (0..1) required to accept a baseline. */
export const MIN_CALIBRATION_QUALITY = 0.55;

// ---------------------------------------------------------------------------
// MediaPipe assets
// ---------------------------------------------------------------------------

/** Pinned to the installed @mediapipe/tasks-vision version for cache stability. */
export const MEDIAPIPE_WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

/** Face Landmarker model bundle (includes refined iris landmarks). */
export const FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
