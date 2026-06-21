import { Vec2, ViewerSample } from '@shared/types'

/** Axis-aligned bounding box in normalized image coords [0..1]. */
export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

/** One detected face, as surfaced to the dev view. */
export interface TrackedFace {
  /** Stable id once locked; null for un-locked/ignored faces. */
  faceId: number | null
  box: BBox
  /** Eye centers (iris), normalized image coords. */
  leftEye: Vec2
  rightEye: Vec2
  /** Full mesh landmarks (normalized) for the dev face-mesh overlay; may be empty. */
  landmarks: Vec2[]
  /** True for the single locked (first-person) face. */
  locked: boolean
}

/** Per-detection output, consumed by geometry + dev panels. */
export interface TrackerFrame {
  /** The locked viewer's sample, or null when nobody is locked. */
  sample: ViewerSample | null
  /** Every detected face (locked + ignored) for visualization. */
  faces: TrackedFace[]
  /** Source frame dimensions (pixels). */
  videoWidth: number
  videoHeight: number
  timestamp: number
  /** Wall-clock ms spent inside the detector (perf panel). */
  detectMs: number
  /** Effective detections per second (smoothed). */
  detectFps: number
}

export type TrackerFrameCallback = (frame: TrackerFrame) => void

/**
 * Source-agnostic viewer tracker. Phase 1: MediaPipeFaceTracker (face landmarks).
 * Phase 2 can add a pose-based implementation behind this same interface.
 */
export interface ViewerTracker {
  /** Start camera capture + detection. Optionally pin a camera deviceId. */
  start(deviceId?: string): Promise<void>
  stop(): void
  /** Subscribe to detection frames; returns an unsubscribe fn. */
  onFrame(cb: TrackerFrameCallback): () => void
  /** The underlying <video> element (for the dev camera panel). */
  getVideoElement(): HTMLVideoElement | null
  /** Enumerate available cameras (labels require a granted permission). */
  listCameras(): Promise<MediaDeviceInfo[]>
  isRunning(): boolean
}
