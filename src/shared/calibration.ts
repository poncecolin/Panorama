/**
 * Pure calibration math used by the wizard. Kept dependency-free + unit-tested.
 */

/** Physical screen size (mm) from the advertised diagonal (inches) + pixel aspect. */
export function screenMmFromDiagonal(
  diagonalInches: number,
  aspectW: number,
  aspectH: number
): { widthMm: number; heightMm: number } {
  const diagMm = diagonalInches * 25.4
  const ratio = Math.hypot(aspectW, aspectH)
  return {
    widthMm: (diagMm * aspectW) / ratio,
    heightMm: (diagMm * aspectH) / ratio
  }
}

/**
 * Solve the camera's horizontal FOV from one observation at a KNOWN distance.
 *
 * depth = focalNorm * ipd / interEyeNorm, with focalNorm = 0.5 / tan(fov/2).
 * Given a measured eye-to-screen distance, the assumed IPD, and the observed
 * inter-eye distance (fraction of frame width), recover the FOV. Clamped to a
 * sane lens range so a bad capture can't produce a wild value.
 */
export function fovFromObservation(
  depthMm: number,
  interEyeNorm: number,
  ipdMm: number
): number {
  const focalNorm = (depthMm * interEyeNorm) / ipdMm
  const fovRad = 2 * Math.atan(0.5 / focalNorm)
  const fovDeg = (fovRad * 180) / Math.PI
  return Math.min(110, Math.max(40, fovDeg))
}
