import { Vec3 } from '@shared/types'

/**
 * Standard OpenGL perspective frustum as a column-major 4x4 (Three.js order).
 * Asymmetric l/r/b/t enable the off-axis ("window") projection.
 */
export function frustum(
  l: number,
  r: number,
  b: number,
  t: number,
  n: number,
  f: number
): number[] {
  const rl = r - l
  const tb = t - b
  const fn = f - n
  // column-major
  return [
    (2 * n) / rl, 0, 0, 0,
    0, (2 * n) / tb, 0, 0,
    (r + l) / rl, (t + b) / tb, -(f + n) / fn, -1,
    0, 0, -(2 * f * n) / fn, 0
  ]
}

/**
 * Off-axis (generalized) perspective projection for a screen rectangle centered
 * at the origin in the z=0 plane (screen space: +X right, +Y up, +Z toward the
 * viewer), viewed from eye E. Returns the projection matrix only — the renderer
 * places the camera at E with identity rotation (looking down -Z), so the screen
 * basis equals the world basis and the view matrix is simply translate(-E).
 *
 * Derived from Kooima, "Generalized Perspective Projection".
 */
export function offAxisProjection(
  eye: Vec3,
  screenWidthMm: number,
  screenHeightMm: number,
  near: number,
  far: number
): number[] {
  const hw = screenWidthMm / 2
  const hh = screenHeightMm / 2

  // Eye distance to the screen plane (z=0). Clamp so we never divide by ~0.
  const d = Math.max(eye.z, 1e-3)
  const ratio = near / d

  const l = (-hw - eye.x) * ratio
  const r = (hw - eye.x) * ratio
  const b = (-hh - eye.y) * ratio
  const t = (hh - eye.y) * ratio

  return frustum(l, r, b, t, near, far)
}
