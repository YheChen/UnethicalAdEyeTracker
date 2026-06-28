/** Small numeric helpers and a fixed-window moving average for jitter damping. */

/** Clamp a value into the inclusive [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamp a value into [0, 1]. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Linear interpolation between a and b by t (0..1). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Euclidean distance between two 2D points. */
export function distance2D(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * A fixed-capacity moving average. Old samples drop out of the window as new
 * ones arrive, producing a stable mean that smooths per-frame measurement noise
 * without the lag of an ever-growing average.
 */
export class MovingAverage {
  private readonly buffer: number[] = [];
  private sum = 0;

  constructor(private readonly capacity: number) {}

  /** Add a sample and return the current windowed mean. */
  push(value: number): number {
    this.buffer.push(value);
    this.sum += value;
    if (this.buffer.length > this.capacity) {
      this.sum -= this.buffer.shift() as number;
    }
    return this.mean;
  }

  /** Current mean of the samples in the window (0 when empty). */
  get mean(): number {
    return this.buffer.length === 0 ? 0 : this.sum / this.buffer.length;
  }

  /** Population standard deviation across the window (0 when < 2 samples). */
  get standardDeviation(): number {
    const n = this.buffer.length;
    if (n < 2) return 0;
    const mean = this.mean;
    let acc = 0;
    for (const v of this.buffer) {
      const d = v - mean;
      acc += d * d;
    }
    return Math.sqrt(acc / n);
  }

  /** Whether the window has reached its full capacity. */
  get isFull(): boolean {
    return this.buffer.length >= this.capacity;
  }

  /** Number of samples currently held. */
  get size(): number {
    return this.buffer.length;
  }

  /** Drop all samples. */
  reset(): void {
    this.buffer.length = 0;
    this.sum = 0;
  }
}
