/**
 * DebugPanel — a collapsible technical readout for tuning the gaze pipeline.
 *
 * Collapsed by default behind a small "Debug" toggle. When open it shows a
 * monospace key/value grid of the live gaze metrics, attention timers, frame
 * rate, pipeline statuses and the captured calibration baseline. Positioning is
 * left to the parent via `className`.
 */

import { useState } from "react";
import type { CalibrationBaseline, GazeState } from "../types/gaze";
import type { DebugMetrics } from "../hooks/useGazeDetection";
import type { FaceTrackingStatus } from "../hooks/useFaceTracking";
import type { StatusKind } from "./StatusBadge";

export interface DebugPanelProps {
  gaze: GazeState;
  metrics: DebugMetrics;
  baseline: CalibrationBaseline | null;
  fps: number;
  playing: boolean;
  attentive: boolean;
  status: StatusKind;
  faceTrackingStatus: FaceTrackingStatus;
  className?: string;
}

/** Format a number to a fixed number of decimals, guarding non-finite values. */
function fmt(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

/** A boolean rendered as a colored ✓ / ✗ glyph. */
function BoolValue({ value }: { value: boolean }): JSX.Element {
  return (
    <span
      className={value ? "text-emerald-400" : "text-rose-400"}
      aria-label={value ? "true" : "false"}
    >
      {value ? "✓" : "✗"}
    </span>
  );
}

/** A single label/value row in the monospace grid. */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right tabular-nums text-slate-100">{children}</dd>
    </>
  );
}

export function DebugPanel(props: DebugPanelProps): JSX.Element {
  const {
    gaze,
    metrics,
    baseline,
    fps,
    playing,
    attentive,
    status,
    faceTrackingStatus,
    className,
  } = props;

  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      {/* Toggle ------------------------------------------------------------ */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Hide debug panel" : "Show debug panel"}
        className="btn btn-ghost glass-soft !px-3 !py-1.5 text-xs"
      >
        {/* Chevron rotates to indicate open/closed state. */}
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            d="M5 8l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-semibold tracking-wide">Debug</span>
      </button>

      {/* Panel ------------------------------------------------------------- */}
      {open && (
        <div className="glass-panel mt-2 w-72 rounded-2xl p-4 animate-fade-in-up">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[0.7rem] font-semibold uppercase tracking-widest text-brand-200">
              Gaze Telemetry
            </span>
            <span className="chip bg-white/5 font-mono text-[0.65rem] text-slate-300">
              {fmt(fps, 0)} fps
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[0.72rem] leading-relaxed">
            <Row label="face detected">
              <BoolValue value={gaze.faceDetected} />
            </Row>
            <Row label="eyes open">
              <BoolValue value={gaze.eyesOpen} />
            </Row>
            <Row label="confidence">{fmt(gaze.confidence, 3)}</Row>
            <Row label="gaze x">{fmt(metrics.gazeX, 3)}</Row>
            <Row label="gaze y">{fmt(metrics.gazeY, 3)}</Row>
            <Row label="head yaw">{fmt(metrics.yaw, 2)}°</Row>
            <Row label="head pitch">{fmt(metrics.pitch, 2)}°</Row>
            <Row label="deviation">{fmt(metrics.deviation, 3)}</Row>
            <Row label="ms since gaze">{fmt(metrics.msSinceValidGaze, 0)}</Row>
            <Row label="grace left (ms)">
              {fmt(metrics.graceRemainingMs, 0)}
            </Row>
            <Row label="tracking">
              <span className="text-slate-200">{faceTrackingStatus}</span>
            </Row>
            <Row label="playback">
              <span className="text-slate-200">
                {playing ? "playing" : "paused"}
              </span>
            </Row>
            <Row label="status">
              <span className="text-slate-200">{status}</span>
            </Row>
            <Row label="attentive">
              <BoolValue value={attentive} />
            </Row>
          </dl>

          {/* Calibration baseline ------------------------------------------ */}
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-widest text-brand-200">
              Calibration
            </div>
            {baseline ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[0.72rem] leading-relaxed">
                <Row label="base gaze x">{fmt(baseline.gazeX, 3)}</Row>
                <Row label="base gaze y">{fmt(baseline.gazeY, 3)}</Row>
                <Row label="base yaw">{fmt(baseline.yaw, 2)}°</Row>
                <Row label="base pitch">{fmt(baseline.pitch, 2)}°</Row>
                <Row label="quality">{fmt(baseline.quality, 3)}</Row>
              </dl>
            ) : (
              <p className="font-mono text-[0.72rem] text-slate-500">
                not calibrated
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DebugPanel;
