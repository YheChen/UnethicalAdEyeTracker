import { useEffect, useRef } from "react";
import { MIN_CALIBRATION_QUALITY } from "../utils/constants";

export interface CalibrationPanelProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Whether a face is currently detected (drives helper text + gating). */
  faceDetected: boolean;
  /** 0..1 live calibration stability. Higher = steadier gaze. */
  quality: number;
  /** Invoked when the user confirms calibration. */
  onCalibrate: () => void;
}

/**
 * Calibration step: the user fixates the centre target while we sample a stable
 * baseline. Renders a live mirrored webcam preview (drawn from the single shared
 * off-screen <video> onto a <canvas>, since only one <video> element exists),
 * an animated fixation reticle, and a stability bar gating the Calibrate button.
 */
export function CalibrationPanel({
  videoRef,
  faceDetected,
  quality,
  onCalibrate,
}: CalibrationPanelProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw the shared off-screen video onto our canvas every animation frame,
  // mirrored horizontally so it reads like a mirror. The loop runs for the
  // lifetime of the mounted panel and is torn down on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;

    const draw = () => {
      rafId = requestAnimationFrame(draw);

      const video = videoRef.current;
      // Skip until the video is actually producing frames.
      if (!video || video.videoWidth === 0 || video.readyState < 2) return;

      // Match the backing store to the displayed size for crisp output.
      const { clientWidth: w, clientHeight: h } = canvas;
      if (w === 0 || h === 0) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      // Cover-fit the video into the canvas (preserve aspect, crop overflow).
      const videoAspect = video.videoWidth / video.videoHeight;
      const canvasAspect = w / h;
      let drawW = w;
      let drawH = h;
      if (videoAspect > canvasAspect) {
        // Video is wider — fit height, crop sides.
        drawH = h;
        drawW = h * videoAspect;
      } else {
        // Video is taller — fit width, crop top/bottom.
        drawW = w;
        drawH = w / videoAspect;
      }
      const offsetX = (w - drawW) / 2;
      const offsetY = (h - drawH) / 2;

      ctx.save();
      // Mirror horizontally about the canvas centre.
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
      ctx.restore();
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [videoRef]);

  const qualityPct = Math.round(Math.max(0, Math.min(1, quality)) * 100);
  const canCalibrate = faceDetected && quality >= MIN_CALIBRATION_QUALITY;

  // Contextual helper text guiding the user toward a clean capture.
  const helperText = !faceDetected
    ? "Position your face in view"
    : quality < MIN_CALIBRATION_QUALITY
      ? "Hold still…"
      : "Ready — press Calibrate";

  // Bar colour reflects readiness: green once stable, amber while settling.
  const barColor = canCalibrate
    ? "from-emerald-400 to-emerald-500"
    : "from-amber-400 to-amber-500";

  return (
    <div className="glass-panel mx-auto w-full max-w-md animate-scale-in rounded-2xl p-6 text-center shadow-glass sm:p-8">
      <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
        Calibration
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">
        Look directly at the center of the advertisement and press Calibrate.
      </p>

      {/* Live mirrored preview with a centre fixation reticle. */}
      <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/60">
        <canvas ref={canvasRef} className="h-full w-full" />

        {/* Fixation target: concentric pulsing rings + crosshair the user stares at. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <span className="absolute h-20 w-20 rounded-full border border-brand-300/40 animate-pulse-ring" />
            <span className="absolute h-12 w-12 rounded-full border border-brand-200/60" />
            {/* Crosshair lines. */}
            <span className="absolute h-px w-10 bg-brand-100/70" />
            <span className="absolute h-10 w-px bg-brand-100/70" />
            {/* Centre dot. */}
            <span className="h-2 w-2 rounded-full bg-brand-300 shadow-glow-brand" />
          </div>
        </div>

        {/* Subtle "no face" veil to reinforce the helper text. */}
        {!faceDetected && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="chip glass-soft text-slate-200">
              No face detected
            </span>
          </div>
        )}
      </div>

      {/* Calibration-quality meter. */}
      <div className="mt-5 text-left">
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-300">
          <span>Calibration quality</span>
          <span className="tabular-nums text-slate-200">{qualityPct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-300 ease-out`}
            style={{ width: `${qualityPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">{helperText}</p>
      </div>

      <button
        type="button"
        className="btn btn-primary mt-6 w-full"
        disabled={!canCalibrate}
        onClick={onCalibrate}
      >
        Calibrate
      </button>
    </div>
  );
}

export default CalibrationPanel;
