/**
 * Time helpers and the attention "grace window" gate.
 *
 * The attention system is intentionally forgiving: a single grace window
 * (a few hundred milliseconds) covers both natural blinks and brief tracking
 * loss, so the ad does not flicker between play/pause on every dropped frame.
 * All timestamps are high-resolution {@link performance.now} values (ms).
 */

/** Current high-resolution timestamp in milliseconds. */
export function now(): number {
  return performance.now();
}

/**
 * Whether at least `ms` milliseconds have elapsed since `sinceTs`.
 *
 * @param sinceTs reference timestamp (performance.now scale)
 * @param ms      duration to test against
 * @param current optional "now" override (defaults to {@link now})
 */
export function hasElapsed(sinceTs: number, ms: number, current?: number): boolean {
  return (current ?? now()) - sinceTs >= ms;
}

/**
 * Tracks the last moment attention was confirmed and reports whether we are
 * still within the grace window.
 *
 * "Confirmed" means the user is looking at the ad, with eyes open and a face
 * detected. While confirmations keep arriving the gate stays attentive; once
 * they stop, attention persists for up to `graceMs` before lapsing — which is
 * what smooths over blinks and momentary detection gaps.
 */
export class AttentionGate {
  /**
   * Timestamp of the most recent confirmation. `-Infinity` means "never
   * confirmed", which makes {@link msSinceConfirmed} report `Infinity`.
   */
  private lastConfirmed = -Infinity;

  /** Mark attention as just-confirmed at time `t` (start of an attentive run). */
  prime(t: number): void {
    this.lastConfirmed = t;
  }

  /** If `confirmed`, record `t` as the latest moment attention was verified. */
  update(confirmed: boolean, t: number): void {
    if (confirmed) {
      this.lastConfirmed = t;
    }
  }

  /**
   * Milliseconds since attention was last confirmed. Returns `Infinity` before
   * the first prime/confirmation.
   */
  msSinceConfirmed(t: number): number {
    if (this.lastConfirmed === -Infinity) return Infinity;
    return t - this.lastConfirmed;
  }

  /** Whether we are still within the `graceMs` window of the last confirmation. */
  isAttentive(t: number, graceMs: number): boolean {
    return this.msSinceConfirmed(t) <= graceMs;
  }

  /** Forget all history (back to "never confirmed"). */
  reset(): void {
    this.lastConfirmed = -Infinity;
  }
}
