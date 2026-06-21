/**
 * Panorama shared types — the contracts that tie together the three swappable
 * boundaries (ViewerTracker, SceneRenderer, Scene) plus the geometry pipeline.
 *
 * Keep this module dependency-free (no Electron, no Three.js, no MediaPipe) so it
 * can be imported from the main process, the renderer, web workers, and tests.
 */

export interface Vec2 {
  x: number
  y: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * A single observation from a ViewerTracker, expressed in normalized image space.
 * Origin (0,0) = top-left of the camera frame, (1,1) = bottom-right.
 *
 * This is intentionally device/library-agnostic: any tracker (face landmarks now,
 * body pose later) produces ViewerSamples, and the GeometrySolver turns them into
 * a metric eye position. The tracker must NOT do metric math itself.
 */
export interface ViewerSample {
  /** Midpoint between the eyes, normalized image coords [0..1]. */
  eyeCenter: Vec2
  /** Left & right eye positions, normalized image coords (left = viewer's left). */
  leftEye: Vec2
  rightEye: Vec2
  /** Distance between the eyes as a fraction of frame WIDTH (used for depth). */
  interEyeNorm: number
  /**
   * Head yaw in degrees (rotation about vertical). Used to cos-correct the
   * depth-from-IPD estimate, which otherwise reads a turned head as farther away.
   * Optional/sign-agnostic; absent (or 0) means no correction.
   */
  yawDeg?: number
  /** Tracker confidence [0..1]. 1 = clean front-facing open-eyed face. */
  confidence: number
  /** Stable id for the locked viewer (first-person lock). */
  faceId: number
  /** Capture timestamp (ms, performance.now() domain). */
  timestamp: number
}

/** Camera intrinsics needed to convert image observations to angles/metric. */
export interface CameraIntrinsics {
  /** Horizontal field of view in degrees. */
  horizontalFovDeg: number
  /** Native capture resolution (pixels). */
  frameWidth: number
  frameHeight: number
}

/**
 * Rigid placement of the camera relative to the screen, in screen-centered metric
 * coordinates (millimetres). Screen space: origin at the screen CENTER, +X right,
 * +Y up, +Z toward the viewer (out of the glass).
 *
 * Phase 1: a laptop webcam sits just above the top edge, looking at the viewer →
 * offset = (0, screenHeight/2 + bezel, 0), yaw/pitch ~0.
 * Phase 2: the camera is placed arbitrarily near a TV → set from calibration.
 */
export interface CameraPlacement {
  /** Camera optical center in screen-space mm. */
  position: Vec3
  /** Camera orientation, degrees. yaw=around Y, pitch=around X, roll=around Z. */
  yawDeg: number
  pitchDeg: number
  rollDeg: number
}

/** Physical screen rectangle (the "glass"), millimetres. */
export interface ScreenGeometry {
  widthMm: number
  heightMm: number
}

/** Average human interpupillary distance assumptions (millimetres). */
export interface ViewerCalibration {
  ipdMm: number
}

/** Defaults that make the illusion work with zero setup. */
export const DEFAULTS = {
  ipdMm: 63,
  horizontalFovDeg: 65,
  /** Fallback physical screen size if the OS can't report it (mm). ~14" 16:9. */
  screenWidthMm: 309,
  screenHeightMm: 174,
  /** Camera assumed centered this far above the top edge of the screen (mm). */
  cameraAboveTopEdgeMm: 8,
  nearPlaneMm: 50,
  farPlaneMm: 100000
} as const

/**
 * The solved viewer pose handed to the renderer each frame: a metric eye position
 * in screen space plus a ready-to-use off-axis (asymmetric) projection matrix.
 */
export interface EyePose {
  /** Eye position in screen-space mm (origin = screen center). */
  eyeMm: Vec3
  /** Column-major 4x4 off-axis projection matrix (OpenGL/Three.js convention). */
  projection: number[]
  /** True when derived from a real tracked viewer (vs. neutral/attract fallback). */
  tracked: boolean
}

/** High-level tracking lifecycle state. */
export enum TrackingState {
  Acquiring = 'acquiring',
  Tracking = 'tracking',
  /** Viewer briefly lost (e.g. turned away); holding the last view before gliding. */
  Holding = 'holding',
  GlideToAttract = 'glide_to_attract',
  Attract = 'attract',
  GlideToTrack = 'glide_to_track'
}

/** Tunable knobs exposed in the dev "Tuning" panel and persisted in settings. */
export interface TuningParams {
  /** One Euro filter minimum cutoff (Hz) — lower = smoother, more lag. */
  oneEuroMinCutoff: number
  /** One Euro filter beta — higher = more responsive to fast motion. */
  oneEuroBeta: number
  /** Multiplier on lateral parallax (1 = physically correct). */
  parallaxGain: number
  /**
   * "Dive in" effect: how strongly the scene is dollied toward the viewer as they
   * approach the screen, so objects loom larger instead of shrinking (which a
   * literal window would do). 0 = pure physical window; higher = stronger looming.
   */
  approachDollyGain: number
  /** Viewer distance (mm) treated as the rest point for the dolly effect. */
  approachRestMm: number
  /**
   * Height of the window above the virtual ground (mm). Small = window near
   * ground level (look "outside" horizontally — good for a TV at normal height);
   * large = window high up (look down over the land — natural for a low laptop).
   * Scenes apply this by offsetting their ground content vertically.
   */
  windowHeightMm: number
  nearPlaneMm: number
  farPlaneMm: number
  /** Freeze the solved pose (debugging). */
  freeze: boolean
  /**
   * --- Tracking robustness (blink & off-angle stability) ---
   * Defaults are chosen to be no-ops on a clean, front-facing, open-eyed face.
   */
  /** Floor on cos(yaw) used to correct depth foreshortening (caps over-correction). */
  yawCosFloor: number
  /** Confidence below which the pose is fully held (freezes through a blink). */
  confidenceFreeze: number
  /** One Euro min-cutoff used at zero confidence (heavier smoothing when unsure). */
  lowConfMinCutoff: number
  /** Implied eye speed (mm/s) above which a sample is treated as an outlier. */
  jumpGateMmPerSec: number
}

export const DEFAULT_TUNING: TuningParams = {
  oneEuroMinCutoff: 1.0,
  oneEuroBeta: 0.02,
  parallaxGain: 1.0,
  approachDollyGain: 0, // default to a true physical window; raise for "dive-in" feel
  approachRestMm: 600,
  windowHeightMm: 500,
  nearPlaneMm: DEFAULTS.nearPlaneMm,
  farPlaneMm: DEFAULTS.farPlaneMm,
  freeze: false,
  yawCosFloor: 0.5, // allow depth correction out to ~60° of yaw
  confidenceFreeze: 0.35,
  lowConfMinCutoff: 0.3,
  jumpGateMmPerSec: 4000 // well above human head speed; only true teleports trip it
}

/** Everything persisted to disk via electron-store. */
export interface AppSettings {
  intrinsics: CameraIntrinsics
  placement: CameraPlacement
  screen: ScreenGeometry
  viewer: ViewerCalibration
  tuning: TuningParams
  activeSceneId: string
  audioEnabled: boolean
  audioVolume: number
  /** Whether the optional calibration wizard has been completed. */
  calibrated: boolean
}

/** Camera/display facts the main process can detect from the OS. */
export interface DisplayInfo {
  /** Physical size in mm if derivable from the OS, else null. */
  physicalWidthMm: number | null
  physicalHeightMm: number | null
  /** Logical resolution and scale factor (always available). */
  width: number
  height: number
  scaleFactor: number
}
