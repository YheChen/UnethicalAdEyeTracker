/**
 * Manages the shared webcam {@link MediaStream} and attaches it to the single
 * off-screen tracking `<video>` element. The MediaPipe face tracker reads from
 * the same video, so we deliberately own exactly one stream here and hand its
 * frames to everything else via that element.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Lifecycle of the webcam request. */
export type WebcamStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unsupported"
  | "error";

export interface UseWebcamResult {
  status: WebcamStatus;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

/** Constraints for a modest, front-facing capture suitable for face tracking. */
const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    facingMode: "user",
  },
  audio: false,
};

/**
 * Request and manage the shared webcam stream, wiring it into `videoRef`.
 *
 * @param videoRef - ref to the off-screen tracking `<video>` element.
 */
export function useWebcam(
  videoRef: React.RefObject<HTMLVideoElement>,
): UseWebcamResult {
  const [status, setStatus] = useState<WebcamStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  /** Holds the live stream so we can stop its tracks deterministically. */
  const streamRef = useRef<MediaStream | null>(null);
  /** Synchronous in-flight flag so a second start() during the getUserMedia
   *  await cannot acquire (and then leak) a second stream. */
  const requestingRef = useRef(false);
  /** False once unmounted, so a stream resolving after unmount is discarded. */
  const mountedRef = useRef(true);

  const start = useCallback(async () => {
    // Guard against double-start, including the in-flight window: streamRef is
    // only assigned after getUserMedia resolves, so without the synchronous
    // `requestingRef` a rapid second call would acquire a second stream.
    if (streamRef.current || requestingRef.current) return;

    // Feature-detect the API before touching it (older / insecure contexts).
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setError(
        "Your browser does not support webcam access. Please try a modern browser over HTTPS.",
      );
      return;
    }

    requestingRef.current = true;
    setStatus("requesting");
    setError(null);

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);

      // If we were unmounted (or stopped) while awaiting permission, discard the
      // freshly granted stream immediately so the camera light does not linger.
      if (!mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // play() can reject (e.g. autoplay policy); the stream is still live, so
        // ignore the rejection — MediaPipe reads frames regardless.
        try {
          await video.play();
        } catch {
          /* autoplay rejection is non-fatal */
        }
      }

      setStatus("active");
    } catch (err) {
      // Normalize the various DOMException names into a friendly status.
      const name = err instanceof DOMException ? err.name : "";
      if (
        name === "NotAllowedError" ||
        name === "SecurityError" ||
        name === "PermissionDeniedError"
      ) {
        setStatus("denied");
        setError(
          "Camera permission was denied. Please allow camera access and try again.",
        );
      } else if (
        name === "NotFoundError" ||
        name === "DevicesNotFoundError" ||
        name === "OverconstrainedError"
      ) {
        setStatus("error");
        setError("No camera found. Please connect a webcam and try again.");
      } else {
        setStatus("error");
        setError(
          err instanceof Error
            ? err.message
            : "Failed to access the camera.",
        );
      }
    } finally {
      requestingRef.current = false;
    }
  }, [videoRef]);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }

    streamRef.current = null;
    setStatus("idle");
    setError(null);
  }, [videoRef]);

  // Ensure the camera light goes out when the component unmounts. We stop the
  // tracks directly (rather than calling `stop`) so this cleanup never depends
  // on a changing callback identity.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      const stream = streamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
    };
  }, []);

  return { status, error, start, stop };
}

export default useWebcam;
