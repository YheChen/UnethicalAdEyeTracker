/**
 * WebcamPreview
 *
 * A small, mirrored live preview of the shared off-screen tracking video.
 *
 * The app uses a SINGLE <video> element (the off-screen tracking source) that
 * MediaPipe reads from — we must NOT mount another <video> bound to the same
 * stream. Instead, this component paints `videoRef.current` onto a <canvas>
 * every animation frame, mirrored horizontally (so it behaves like a mirror),
 * and overlays an animated gaze-indicator dot at the user's estimated iris
 * position.
 */

import { useEffect, useRef } from "react";

export interface WebcamPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Run the draw loop. */
  active: boolean;
  /** Camera available; if false show a placeholder instead of the canvas. */
  available: boolean;
  faceDetected: boolean;
  /** Smoothed normalized iris x (0..1) for the indicator dot. */
  gazeX?: number;
  /** Smoothed normalized iris y (0..1). */
  gazeY?: number;
  className?: string;
}

export function WebcamPreview({
  videoRef,
  active,
  available,
  faceDetected,
  gazeX,
  gazeY,
  className,
}: WebcamPreviewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep the latest per-frame inputs in refs so the rAF loop reads current
  // values without being torn down and recreated on every prop change.
  const faceDetectedRef = useRef(faceDetected);
  const gazeXRef = useRef(gazeX);
  const gazeYRef = useRef(gazeY);

  faceDetectedRef.current = faceDetected;
  gazeXRef.current = gazeX;
  gazeYRef.current = gazeY;

  useEffect(() => {
    // Nothing to draw unless we are active and the camera is available.
    if (!active || !available) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;

    const render = () => {
      rafId = requestAnimationFrame(render);

      // Wait until the video has real frames to sample.
      if (video.readyState < 2 || video.videoWidth === 0) return;

      const width = canvas.width;
      const height = canvas.height;

      // Cover-fit the (typically 4:3) webcam feed into the 16:9 canvas:
      // preserve the source aspect ratio and crop the overflow, rather than
      // stretching it (which would squish the user's face). Then mirror
      // horizontally so the preview reads like a mirror.
      const videoAspect = video.videoWidth / video.videoHeight;
      const canvasAspect = width / height;
      let drawW = width;
      let drawH = height;
      if (videoAspect > canvasAspect) {
        // Source is wider — match height, crop the sides.
        drawH = height;
        drawW = height * videoAspect;
      } else {
        // Source is taller — match width, crop top/bottom.
        drawW = width;
        drawH = width / videoAspect;
      }
      const offsetX = (width - drawW) / 2;
      const offsetY = (height - drawH) / 2;

      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
      ctx.restore();

      // Overlay the gaze indicator dot when a face is being tracked.
      if (faceDetectedRef.current) {
        const gx = clamp01(gazeXRef.current ?? 0.5);
        const gy = clamp01(gazeYRef.current ?? 0.5);

        // The canvas is mirrored, so flip x to match what the user sees.
        const dotX = clamp((1 - gx) * width, 6, width - 6);
        const dotY = clamp(gy * height, 6, height - 6);

        // Soft outer glow.
        ctx.beginPath();
        ctx.arc(dotX, dotY, 12, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
        ctx.fill();

        // Bright core.
        ctx.beginPath();
        ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(125, 211, 252, 0.95)";
        ctx.fill();

        // Crisp ring.
        ctx.beginPath();
        ctx.arc(dotX, dotY, 7.5, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.stroke();
      }
    };

    rafId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(rafId);
  }, [active, available, videoRef]);

  return (
    <div
      className={`glass-panel overflow-hidden rounded-2xl border border-white/10 ${
        className ?? ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {available && active && (
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-red-500/70" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Live
          </span>
        </div>
        <span className="text-[11px] font-medium text-slate-400">
          Webcam preview
        </span>
      </div>

      {/* 16:9 preview area */}
      <div className="relative aspect-video w-full bg-black/60">
        {available ? (
          <canvas
            ref={canvasRef}
            width={384}
            height={216}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
            <CameraOffIcon className="h-8 w-8 opacity-70" />
            <span className="text-xs font-medium">Camera unavailable</span>
          </div>
        )}
      </div>

      {/* Privacy caption */}
      <p className="px-3 py-1.5 text-center text-[10px] leading-tight text-slate-500">
        Processed locally — never uploaded.
      </p>
    </div>
  );
}

/** Local clamp helpers (kept tiny to avoid a cross-module import here). */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Inline camera-off icon shown when no camera feed is available. */
function CameraOffIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 2l20 20" />
      <path d="M7 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12" />
      <path d="M9.5 4h5l1.5 2.5H20a2 2 0 0 1 2 2v8.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export default WebcamPreview;
