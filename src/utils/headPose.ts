/**
 * Head-pose estimation from MediaPipe's 4x4 facial transformation matrix.
 *
 * MediaPipe returns the matrix as a flat, column-major array of 16 numbers.
 * The top-left 3x3 block is the rotation; we extract Tait–Bryan (yaw/pitch/roll)
 * angles from it. The absolute values are only used relative to a calibrated
 * baseline, so a consistent extraction matters more than a canonical convention.
 */

const RAD_TO_DEG = 180 / Math.PI;

export interface HeadPose {
  /** Turn left/right, in degrees. */
  yaw: number;
  /** Look up/down, in degrees. */
  pitch: number;
  /** Tilt, in degrees. */
  roll: number;
}

/** Read element at (row, col) from a column-major flat 4x4 matrix. */
function at(data: number[], row: number, col: number): number {
  return data[col * 4 + row];
}

/**
 * Convert a column-major 4x4 transformation matrix into approximate Euler
 * angles in degrees. Returns zeros if the matrix is missing/degenerate.
 */
export function matrixToHeadPose(data: number[] | undefined): HeadPose {
  if (!data || data.length < 16) {
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  // Rotation matrix elements.
  const r00 = at(data, 0, 0);
  const r10 = at(data, 1, 0);
  const r12 = at(data, 1, 2);
  const r02 = at(data, 0, 2);
  const r22 = at(data, 2, 2);

  // Clamp the term fed to asin to avoid NaN from floating point overshoot.
  const sinPitch = Math.max(-1, Math.min(1, -r12));

  const pitch = Math.asin(sinPitch) * RAD_TO_DEG;
  const yaw = Math.atan2(r02, r22) * RAD_TO_DEG;
  const roll = Math.atan2(r10, r00) * RAD_TO_DEG;

  return { yaw, pitch, roll };
}
