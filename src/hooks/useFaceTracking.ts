/**
 * useFaceTracking — loads the MediaPipe FaceLandmarker once and runs a
 * requestAnimationFrame detection loop over the shared off-screen webcam video.
 *
 * Design notes:
 * - The model is created exactly once (status "loading" -> "ready"). Creation
 *   tries the GPU delegate first and transparently falls back to CPU.
 * - The hot loop reads `onFrame` and `enabled` through refs so that callers can
 *   pass a fresh `onFrame` closure every render without tearing down/restarting
 *   the loop or the model.
 * - Detection is wrapped in try/catch: a single transient frame failure must
 *   never kill the loop, and a CDN/model load failure surfaces as status
 *   "error" rather than throwing into React's render.
 */

import { useEffect, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  FACE_LANDMARKER_MODEL_URL,
  MEDIAPIPE_WASM_CDN,
} from "../utils/constants";

/** Lifecycle of the underlying FaceLandmarker model. */
export type FaceTrackingStatus = "idle" | "loading" | "ready" | "error";

/** One processed detection frame handed back to the consumer. */
export interface FaceFrame {
  /** Whether at least one face was found this frame. */
  faceDetected: boolean;
  /** The first face's 478 landmarks, or null when no face was detected. */
  landmarks: NormalizedLandmark[] | null;
  /** The flat 4x4 facial transformation matrix, or null when unavailable. */
  matrix: number[] | null;
  /** High-resolution wall-clock timestamp (performance.now) for the frame. */
  timestamp: number;
}

export interface UseFaceTrackingOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Run the detection loop only while true (and the model is ready). */
  enabled: boolean;
  /** Invoked for every processed frame. Kept in a ref; safe to recreate. */
  onFrame: (frame: FaceFrame) => void;
}

export interface UseFaceTrackingResult {
  status: FaceTrackingStatus;
  error: string | null;
}

/**
 * Build a FaceLandmarker, trying the requested delegate. Thrown errors bubble
 * up so the caller can decide whether to retry on a different delegate.
 */
async function createLandmarker(
  delegate: "GPU" | "CPU",
): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
  });
}

export function useFaceTracking(
  opts: UseFaceTrackingOptions,
): UseFaceTrackingResult {
  const { videoRef, enabled, onFrame } = opts;

  const [status, setStatus] = useState<FaceTrackingStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Hot-path values held in refs so the rAF loop never needs to be rebuilt.
  const onFrameRef = useRef(onFrame);
  const enabledRef = useRef(enabled);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);

  // Keep the refs current without disturbing the loop/model effects.
  onFrameRef.current = onFrame;
  enabledRef.current = enabled;

  // ---- Model lifecycle: create once on mount, close on unmount. ----------
  useEffect(() => {
    let cancelled = false;

    setStatus("loading");
    setError(null);

    (async () => {
      let landmarker: FaceLandmarker | null = null;
      try {
        // Prefer the GPU delegate for performance.
        landmarker = await createLandmarker("GPU");
      } catch {
        // GPU may be unavailable (e.g. headless/software contexts) — retry CPU.
        try {
          landmarker = await createLandmarker("CPU");
        } catch (cpuErr) {
          if (!cancelled) {
            setStatus("error");
            setError(
              cpuErr instanceof Error
                ? cpuErr.message
                : "Failed to load the face tracking model.",
            );
          }
          return;
        }
      }

      if (cancelled) {
        // The component unmounted while we were loading — discard the model.
        landmarker.close();
        return;
      }

      landmarkerRef.current = landmarker;
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  // ---- Detection loop: active only while enabled and the model is ready. -
  useEffect(() => {
    if (status !== "ready" || !enabled) return;

    let rafId = 0;
    // MediaPipe requires strictly-increasing timestamps for VIDEO mode.
    let lastTs = 0;

    const tick = () => {
      // Re-read live values so the loop respects the latest enabled/onFrame.
      if (!enabledRef.current) return;

      const landmarker = landmarkerRef.current;
      const video = videoRef.current;

      // Only run detection once the video actually has decoded frame data.
      if (
        landmarker &&
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0
      ) {
        // Monotonic timestamp guards against duplicate/regressing rAF clocks.
        const ts = Math.max(lastTs + 1, performance.now());
        lastTs = ts;

        try {
          const result = landmarker.detectForVideo(video, ts);
          const faces = result.faceLandmarks;
          const frame: FaceFrame = {
            faceDetected: faces.length > 0,
            landmarks: faces.length > 0 ? faces[0] : null,
            matrix:
              result.facialTransformationMatrixes[0]?.data ?? null,
            timestamp: performance.now(),
          };
          onFrameRef.current(frame);
        } catch {
          // Swallow transient per-frame errors; keep the loop alive.
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [status, enabled, videoRef]);

  return { status, error };
}

export default useFaceTracking;
