import { Vec2 } from '@shared/types'

/**
 * Pure face-geometry helpers for the viewer tracker — deliberately free of any
 * MediaPipe types so the math is unit-testable without a webcam or the wasm.
 *
 * Why this exists: the original tracker derived the viewpoint from the IRIS
 * landmarks, which are the *least* robust feature available — a blink occludes
 * them and they degrade first under head yaw. These helpers move the viewpoint
 * onto blink-stable eye-corner landmarks, read true head yaw from the 6DoF
 * facial-transformation matrix, and turn blink/yaw into a single confidence
 * scalar the GeometrySolver can use to stay steady when tracking is unreliable.
 */

/**
 * Eye-corner landmark indices in MediaPipe's 478-point FaceLandmarker mesh.
 * The midpoint of an eye's inner+outer corner sits ≈ at the pupil, so it tracks
 * the viewpoint as well as the iris would — but it doesn't vanish during a blink
 * and barely moves with gaze. Inter-center distance stays ≈ IPD-scale, so the
 * depth-from-IPD calibration is preserved.
 */
export const EYE_CORNERS = {
  left: { outer: 33, inner: 133 },
  right: { inner: 362, outer: 263 }
} as const

export interface EyeCenters {
  /** Eye near iris 468 (kept as "left" to match the prior tracker naming). */
  left: Vec2
  /** Eye near iris 473. */
  right: Vec2
}

const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Per-eye centers from the corner midpoints (normalized image coords). */
export function eyeCenters(landmarks: Vec2[]): EyeCenters {
  return {
    left: mid(landmarks[EYE_CORNERS.left.outer], landmarks[EYE_CORNERS.left.inner]),
    right: mid(landmarks[EYE_CORNERS.right.inner], landmarks[EYE_CORNERS.right.outer])
  }
}

const RAD2DEG = 180 / Math.PI

/**
 * Head yaw (rotation about the vertical Y axis) in degrees from MediaPipe's 4×4
 * facial-transformation matrix (column-major, 16 numbers). For a yaw rotation
 * Ry(θ) the upper-right / lower-right rotation terms give atan2(sinθ, cosθ) = θ.
 *
 * Only the MAGNITUDE is used downstream (cos(yaw) depth correction and a yaw
 * confidence falloff are both even in yaw), so the exact sign convention is not
 * load-bearing; the signed value is returned for the dev Pose panel readout.
 */
export function headYawDeg(matrix: number[]): number {
  if (!matrix || matrix.length < 16) return 0
  // Column-major: element (row r, col c) = matrix[c*4 + r]. R[0][2]=m[8], R[2][2]=m[10].
  return Math.atan2(matrix[8], matrix[10]) * RAD2DEG
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Smooth 0→1 ramp between two edges (Hermite), like GLSL smoothstep. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

// Blink: blendshape score below OPEN is trusted, above CLOSED is ignored.
const BLINK_OPEN = 0.3
const BLINK_CLOSED = 0.6
// Yaw: full trust until FULL°, fading to zero by LOST° (where iris/landmarks rot away).
const YAW_FULL_DEG = 30
const YAW_LOST_DEG = 55

/**
 * Tracker confidence [0..1] from blink amount and head yaw. Returns 1 for a
 * clean, front-facing, open-eyed face (so behavior is unchanged in the common
 * case) and falls toward 0 as the viewer blinks or turns far off-axis.
 *
 * @param blink  max(eyeBlinkLeft, eyeBlinkRight) blendshape score, 0 (open)..1 (shut)
 * @param yawDeg head yaw in degrees (sign-agnostic)
 */
export function confidenceFrom(blink: number, yawDeg: number): number {
  const blinkFactor = 1 - smoothstep(BLINK_OPEN, BLINK_CLOSED, blink)
  const yawFactor = 1 - smoothstep(YAW_FULL_DEG, YAW_LOST_DEG, Math.abs(yawDeg))
  return clamp01(blinkFactor * yawFactor)
}
