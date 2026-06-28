import { MIN_CONFIDENCE } from "../utils/constants";
import { clamp01 } from "../utils/smoothing";

export interface ConfidenceMeterProps {
  /** Live gaze confidence in 0..1 (values outside the range are clamped). */
  confidence: number;
  /** Caption shown above the track. Defaults to "Confidence". */
  label?: string;
  /** Optional extra classes for layout/positioning by the parent. */
  className?: string;
}

/**
 * A horizontal meter visualising gaze confidence (0..1) against the
 * {@link MIN_CONFIDENCE} acceptance threshold. The gradient fill turns green
 * once confidence meets the threshold and amber/red below it, and a subtle
 * tick marks where the threshold sits along the track.
 */
export function ConfidenceMeter({
  confidence,
  label = "Confidence",
  className = "",
}: ConfidenceMeterProps): JSX.Element {
  // Normalise to the displayable range so width/percent math is always valid.
  const value = clamp01(confidence);
  const percent = Math.round(value * 100);
  const meetsThreshold = value >= MIN_CONFIDENCE;

  // The threshold tick is positioned by the same 0..1 scale as the fill.
  const thresholdPercent = clamp01(MIN_CONFIDENCE) * 100;

  // Green when on-target; amber/red gradient below the threshold so the meter
  // reads as a clear pass/fail signal at a glance.
  const fillGradient = meetsThreshold
    ? "linear-gradient(90deg, #34d399, #10b981)"
    : "linear-gradient(90deg, #f87171, #f59e0b)";

  return (
    <div className={`w-full ${className}`}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span
          className={`font-mono text-xs font-semibold tabular-nums ${
            meetsThreshold ? "text-emerald-300" : "text-amber-300"
          }`}
        >
          {percent}%
        </span>
      </div>

      {/* Track + fill. role=progressbar exposes the live value to assistive tech. */}
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${value * 100}%`, backgroundImage: fillGradient }}
        />

        {/* Threshold tick: a thin marker showing the MIN_CONFIDENCE cutoff. */}
        <div
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-white/70 shadow-[0_0_4px_rgba(255,255,255,0.5)]"
          style={{ left: `${thresholdPercent}%` }}
          aria-hidden="true"
          title={`Threshold ${Math.round(MIN_CONFIDENCE * 100)}%`}
        />
      </div>
    </div>
  );
}

export default ConfidenceMeter;
