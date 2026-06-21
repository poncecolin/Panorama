import {
  CameraIntrinsics,
  CameraPlacement,
  EyePose,
  ScreenGeometry,
  TuningParams,
  Vec3,
  ViewerCalibration,
  ViewerSample
} from '@shared/types'
import { offAxisProjection } from './projection'
import { Vec3OneEuro } from './oneEuro'

export interface GeometryConfig {
  intrinsics: CameraIntrinsics
  placement: CameraPlacement
  screen: ScreenGeometry
  viewer: ViewerCalibration
  tuning: TuningParams
}

const DEG2RAD = Math.PI / 180

/** Clamp on the IPD-derived depth (mm) to reject implausible estimates. */
const MIN_DEPTH_MM = 150
const MAX_DEPTH_MM = 4000

/**
 * How many consecutive "implausible jump" frames to reject before believing them.
 * A genuine glitch lasts one frame; a sustained jump means the viewer really
 * moved, so we accept it (~130 ms at 30 fps) rather than holding the view forever.
 */
const MAX_OUTLIER_FRAMES = 4

/**
 * Converts a normalized ViewerSample into a metric eye position in screen space
 * and an off-axis projection matrix. Pure aside from the One Euro filter state,
 * which makes the solved pose smooth + low-latency over a stream of samples.
 *
 * Screen space: origin at screen center, +X right, +Y up, +Z toward the viewer.
 */
export class GeometrySolver {
  private config: GeometryConfig
  private filter: Vec3OneEuro
  private lastEye: Vec3 | null = null
  private lastTs: number | null = null
  /** Consecutive frames the outlier gate has rejected (escape hatch counter). */
  private outlierFrames = 0

  constructor(config: GeometryConfig) {
    this.config = config
    this.filter = new Vec3OneEuro(
      config.tuning.oneEuroMinCutoff,
      config.tuning.oneEuroBeta
    )
  }

  setConfig(config: GeometryConfig): void {
    this.config = config
    this.filter.setParams(config.tuning.oneEuroMinCutoff, config.tuning.oneEuroBeta)
  }

  reset(): void {
    this.filter.reset()
    this.lastEye = null
    this.lastTs = null
    this.outlierFrames = 0
  }

  /** Metric eye position from a sample, BEFORE smoothing (deterministic; tested). */
  rawEye(sample: ViewerSample): Vec3 {
    const { intrinsics, placement, viewer, tuning } = this.config
    const aspect = intrinsics.frameHeight / intrinsics.frameWidth

    // Pinhole focal length expressed in image-width fractions.
    const focalNorm = 0.5 / Math.tan((intrinsics.horizontalFovDeg * DEG2RAD) / 2)

    // Depth (mm) from apparent inter-eye distance vs. assumed IPD.
    // Head yaw foreshortens the apparent inter-eye distance by ~cos(yaw), which
    // would otherwise read a turned head as FARTHER away (the main off-angle
    // wobble). Scale depth by cos(yaw) to undo it, floored so an extreme angle
    // can't collapse the estimate. cos is even, so the yaw sign doesn't matter.
    const interEye = Math.max(sample.interEyeNorm, 1e-4)
    const yawScale = Math.min(
      Math.max(Math.cos((sample.yawDeg ?? 0) * DEG2RAD), tuning.yawCosFloor),
      1
    )
    let depth = (focalNorm * viewer.ipdMm * yawScale) / interEye
    depth = Math.min(Math.max(depth, MIN_DEPTH_MM), MAX_DEPTH_MM)

    // Ray direction (camera frame: x image-right, y image-down, z toward viewer).
    const xCam = (sample.eyeCenter.x - 0.5) / focalNorm
    const yCam = ((sample.eyeCenter.y - 0.5) * aspect) / focalNorm

    // Eye relative to the camera, in screen-aligned axes. The camera faces the
    // viewer, so image-right maps to screen -X and image-down to screen -Y.
    // parallaxGain scales head movement (feel knob; 1 = physically correct).
    const g = tuning.parallaxGain
    const rel: Vec3 = {
      x: -xCam * depth * g,
      y: -yCam * depth * g,
      z: depth
    }

    // Rotate by the camera's orientation, then offset by its screen-space position.
    const rot = rotate(rel, placement.yawDeg, placement.pitchDeg, placement.rollDeg)
    return {
      x: rot.x + placement.position.x,
      y: rot.y + placement.position.y,
      z: rot.z + placement.position.z
    }
  }

  /** Full solve: smoothed eye + off-axis projection.
   *
   *  Robustness: low-confidence samples (blink, far off-axis, implausible jumps)
   *  must not be allowed to wobble the view — a steady slightly-stale view reads
   *  far better than a jittery one. So confidence (from the tracker) governs the
   *  smoothing: below `confidenceFreeze` we HOLD the last good eye (a blink
   *  becomes invisible); otherwise we lean harder on the prior as confidence
   *  drops by lowering the One Euro min-cutoff for that frame. */
  solve(sample: ViewerSample): EyePose {
    const { screen, tuning } = this.config
    const raw = this.rawEye(sample)
    const tSec = sample.timestamp / 1000

    let eye: Vec3
    if (tuning.freeze && this.lastEye) {
      eye = this.lastEye
    } else {
      const conf = clamp01(sample.confidence)
      const lowConf = this.lastEye !== null && conf < tuning.confidenceFreeze

      // Outlier gate: an implausibly fast jump from the last eye is usually a
      // one-frame bad detection, so reject it. But a jump that PERSISTS means the
      // viewer really moved (e.g. their head translated while turned away during a
      // spin), so we must accept it after a few frames — otherwise the held eye and
      // the live samples never reconcile and the view stays frozen forever.
      const outlier =
        this.lastEye !== null &&
        this.lastTs !== null &&
        dist(raw, this.lastEye) / Math.max(tSec - this.lastTs, 1e-3) > tuning.jumpGateMmPerSec

      if (outlier && this.outlierFrames < MAX_OUTLIER_FRAMES) {
        this.outlierFrames++
        eye = this.lastEye! // reject a transient spike (hold briefly)
      } else if (lowConf) {
        eye = this.lastEye! // genuine low confidence: hold through blink / off-axis
      } else {
        // Accept: normal tracking, or an outlier that persisted long enough to be
        // believed. conf 1 → configured cutoff (unchanged); conf 0 → cautious cutoff.
        this.outlierFrames = 0
        const minCutoff =
          tuning.lowConfMinCutoff + conf * (tuning.oneEuroMinCutoff - tuning.lowConfMinCutoff)
        eye = this.filter.filter(raw, tSec, minCutoff)
        this.lastEye = eye
      }
      this.lastTs = tSec
    }

    return {
      eyeMm: eye,
      projection: offAxisProjection(
        eye,
        screen.widthMm,
        screen.heightMm,
        tuning.nearPlaneMm,
        tuning.farPlaneMm
      ),
      tracked: true
    }
  }

  /** Head-on, centered viewpoint used when no viewer is tracked (attract/neutral). */
  solveNeutral(distanceMm = 600): EyePose {
    return this.poseFromEye({ x: 0, y: 0, z: distanceMm }, false)
  }

  /** Build an off-axis pose from an arbitrary eye position (e.g. attract drift). */
  poseFromEye(eye: Vec3, tracked = false): EyePose {
    const { screen, tuning } = this.config
    return {
      eyeMm: eye,
      projection: offAxisProjection(
        eye,
        screen.widthMm,
        screen.heightMm,
        tuning.nearPlaneMm,
        tuning.farPlaneMm
      ),
      tracked
    }
  }
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Euclidean distance between two points (mm). */
function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Rotate a vector by yaw (Y), pitch (X), roll (Z), in degrees. */
function rotate(v: Vec3, yawDeg: number, pitchDeg: number, rollDeg: number): Vec3 {
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
