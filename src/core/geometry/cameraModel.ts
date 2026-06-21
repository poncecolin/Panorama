/**
 * The pure camera↔screen mapping shared by the GeometrySolver (which APPLIES a
 * known camera placement to turn a sample into a screen-space eye) and the TV
 * calibrator (which SOLVES for the placement from probe observations). Keeping
 * the forward model in one place means the two can never drift apart.
 *
 * Screen space: origin at screen center, +X right, +Y up, +Z toward the viewer.
 * "Camera frame" here means screen-aligned axes positioned at the camera, i.e.
 * the eye relative to the camera BEFORE the placement rotation/translation.
 */
import {
  CameraIntrinsics,
  CameraPlacement,
  TuningParams,
  Vec3,
  ViewerCalibration,
  ViewerSample
} from '@shared/types'

const DEG2RAD = Math.PI / 180

/** Clamp on the IPD-derived depth (mm) to reject implausible estimates. */
export const MIN_DEPTH_MM = 150
export const MAX_DEPTH_MM = 4000

/** Pinhole focal length expressed in image-width fractions. */
export function focalNorm(horizontalFovDeg: number): number {
  return 0.5 / Math.tan((horizontalFovDeg * DEG2RAD) / 2)
}

/**
 * Depth (mm) from apparent inter-eye distance vs. assumed IPD. Head yaw
 * foreshortens the apparent inter-eye distance by ~cos(yaw), which would read a
 * turned head as farther away; scale by cos(yaw) (floored) to undo it. Clamped.
 */
export function depthFromInterEye(
  interEyeNorm: number,
  ipdMm: number,
  horizontalFovDeg: number,
  yawDeg: number,
  yawCosFloor: number
): number {
  const fn = focalNorm(horizontalFovDeg)
  const interEye = Math.max(interEyeNorm, 1e-4)
  const yawScale = Math.min(Math.max(Math.cos(yawDeg * DEG2RAD), yawCosFloor), 1)
  const depth = (fn * ipdMm * yawScale) / interEye
  return Math.min(Math.max(depth, MIN_DEPTH_MM), MAX_DEPTH_MM)
}

/**
 * Eye position in the CAMERA frame (mm) — depends only on the sample + lens, not
 * on where the camera sits. The solver applies a placement to this; the
 * calibrator holds it fixed and solves for the placement.
 */
export function cameraFrameEye(
  sample: Pick<ViewerSample, 'eyeCenter' | 'interEyeNorm' | 'yawDeg'>,
  intrinsics: CameraIntrinsics,
  viewer: ViewerCalibration,
  tuning: Pick<TuningParams, 'parallaxGain' | 'yawCosFloor'>
): Vec3 {
  const aspect = intrinsics.frameHeight / intrinsics.frameWidth
  const fn = focalNorm(intrinsics.horizontalFovDeg)
  const depth = depthFromInterEye(
    sample.interEyeNorm,
    viewer.ipdMm,
    intrinsics.horizontalFovDeg,
    sample.yawDeg ?? 0,
    tuning.yawCosFloor
  )

  // Ray direction (camera frame: x image-right, y image-down, z toward viewer).
  const xCam = (sample.eyeCenter.x - 0.5) / fn
  const yCam = ((sample.eyeCenter.y - 0.5) * aspect) / fn

  // The camera faces the viewer, so image-right maps to screen -X and image-down
  // to screen -Y. parallaxGain scales head movement (1 = physically correct).
  const g = tuning.parallaxGain
  return { x: -xCam * depth * g, y: -yCam * depth * g, z: depth }
}

/** Rotate a vector by yaw (Y), pitch (X), roll (Z), in degrees. */
export function rotate(v: Vec3, yawDeg: number, pitchDeg: number, rollDeg: number): Vec3 {
  if (yawDeg === 0 && pitchDeg === 0 && rollDeg === 0) return v
  const cy = Math.cos(yawDeg * DEG2RAD)
  const sy = Math.sin(yawDeg * DEG2RAD)
  const cp = Math.cos(pitchDeg * DEG2RAD)
  const sp = Math.sin(pitchDeg * DEG2RAD)
  const cr = Math.cos(rollDeg * DEG2RAD)
  const sr = Math.sin(rollDeg * DEG2RAD)

  // Ry (yaw)
  let x = cy * v.x + sy * v.z
  let y = v.y
  let z = -sy * v.x + cy * v.z
  // Rx (pitch)
  const y2 = cp * y - sp * z
  const z2 = sp * y + cp * z
  y = y2
  z = z2
  // Rz (roll)
  const x3 = cr * x - sr * y
  const y3 = sr * x + cr * y
  x = x3
  y = y3
  return { x, y, z }
}

/** Inverse of {@link rotate}: undo Rz, then Rx, then Ry. */
export function rotateInverse(
  v: Vec3,
  yawDeg: number,
  pitchDeg: number,
  rollDeg: number
): Vec3 {
  if (yawDeg === 0 && pitchDeg === 0 && rollDeg === 0) return v
  const cy = Math.cos(yawDeg * DEG2RAD)
  const sy = Math.sin(yawDeg * DEG2RAD)
  const cp = Math.cos(pitchDeg * DEG2RAD)
  const sp = Math.sin(pitchDeg * DEG2RAD)
  const cr = Math.cos(rollDeg * DEG2RAD)
  const sr = Math.sin(rollDeg * DEG2RAD)

  // Rz^-1
  let x = cr * v.x + sr * v.y
  let y = -sr * v.x + cr * v.y
  let z = v.z
  // Rx^-1
  const y2 = cp * y + sp * z
  const z2 = -sp * y + cp * z
  y = y2
  z = z2
  // Ry^-1
  const x3 = cy * x - sy * z
  const z3 = sy * x + cy * z
  x = x3
  z = z3
  return { x, y, z }
}

/** Apply a camera placement to a camera-frame eye → screen-space eye (mm). */
export function applyPlacement(rel: Vec3, placement: CameraPlacement): Vec3 {
  const rot = rotate(rel, placement.yawDeg, placement.pitchDeg, placement.rollDeg)
  return {
    x: rot.x + placement.position.x,
    y: rot.y + placement.position.y,
    z: rot.z + placement.position.z
  }
}

/** Inverse of {@link applyPlacement}: screen-space eye → camera-frame eye. */
export function inverseApplyPlacement(eye: Vec3, placement: CameraPlacement): Vec3 {
  const t: Vec3 = {
    x: eye.x - placement.position.x,
    y: eye.y - placement.position.y,
    z: eye.z - placement.position.z
  }
  return rotateInverse(t, placement.yawDeg, placement.pitchDeg, placement.rollDeg)
}
