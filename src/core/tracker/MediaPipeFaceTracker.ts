import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { Vec2, ViewerSample } from '@shared/types'
import {
  TrackedFace,
  TrackerFrame,
  TrackerFrameCallback,
  ViewerTracker
} from './types'
import { FirstPersonLock, LockCandidate, LockConfig } from './firstPersonLock'
import { confidenceFrom, eyeCenters, headYawDeg } from './faceGeometry'

export interface MediaPipeTrackerOptions {
  wasmPath?: string
  modelPath?: string
  /** Max faces to detect (>=2 so newcomers are visible to the dev view). */
  numFaces?: number
  /** Cap on detections per second. */
  targetFps?: number
  lockConfig?: LockConfig
  width?: number
  height?: number
  /**
   * Camera source seam. Defaults to navigator.mediaDevices.getUserMedia. Override
   * to inject a stream (tests, or Phase 2 alternate/networked camera sources).
   */
  getStream?: (deviceId?: string) => Promise<MediaStream>
}

const DEFAULTS = {
  // Relative so they resolve against document.baseURI in BOTH dev (http) and a
  // packaged build (file://) — absolute "/..." breaks under file://.
  wasmPath: 'mediapipe/wasm',
  modelPath: 'mediapipe/models/face_landmarker.task',
  numFaces: 3,
  targetFps: 30,
  width: 640,
  height: 480
}

// Iris center indices in the 478-point FaceLandmarker mesh.
const LEFT_IRIS_CENTER = 468
const RIGHT_IRIS_CENTER = 473

interface RawFace {
  box: { x: number; y: number; width: number; height: number }
  leftEye: Vec2
  rightEye: Vec2
  landmarks: Vec2[]
}

/**
 * Phase 1 ViewerTracker: webcam → MediaPipe FaceLandmarker → first-person lock →
 * ViewerSample. Detection currently runs on the main thread (paced so it doesn't
 * starve rendering); the MediaPipe wasm does not bootstrap cleanly inside a Vite
 * ESM module worker ("ModuleFactory not set"), so worker offload is a future
 * optimization behind this same interface.
 *
 * This class only produces NORMALIZED image observations — all metric/geometry
 * math happens downstream in the GeometrySolver.
 */
export class MediaPipeFaceTracker implements ViewerTracker {
  private opts: Required<Omit<MediaPipeTrackerOptions, 'lockConfig' | 'getStream'>>
  private landmarker: FaceLandmarker | null = null
  private video: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  private lock: FirstPersonLock
  private getStream: (deviceId?: string) => Promise<MediaStream>
  private callbacks = new Set<TrackerFrameCallback>()
  private running = false
  private lastFrameTs = 0
  private fpsEma = 0
  private rafId = 0

  constructor(options: MediaPipeTrackerOptions = {}) {
    this.opts = {
      wasmPath: options.wasmPath ?? DEFAULTS.wasmPath,
      modelPath: options.modelPath ?? DEFAULTS.modelPath,
      numFaces: options.numFaces ?? DEFAULTS.numFaces,
      targetFps: options.targetFps ?? DEFAULTS.targetFps,
      width: options.width ?? DEFAULTS.width,
      height: options.height ?? DEFAULTS.height
    }
    this.lock = new FirstPersonLock(options.lockConfig)
    this.getStream =
      options.getStream ??
      ((deviceId?: string) =>
        navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: this.opts.width },
            height: { ideal: this.opts.height }
          },
          audio: false
        }))
  }

  isRunning(): boolean {
    return this.running
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video
  }

  onFrame(cb: TrackerFrameCallback): () => void {
    this.callbacks.add(cb)
    return () => this.callbacks.delete(cb)
  }

  async listCameras(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'videoinput')
  }

  async start(deviceId?: string): Promise<void> {
    if (this.running) return

    const fileset = await FilesetResolver.forVisionTasks(
      new URL(this.opts.wasmPath, document.baseURI).href
    )
    const modelAssetPath = new URL(this.opts.modelPath, document.baseURI).href
    const make = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numFaces: this.opts.numFaces,
        // Blendshapes give a per-eye blink score; the transformation matrix gives
        // 6DoF head pose (we read yaw). Both feed the confidence/robustness path.
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true
      })
    // Prefer the GPU delegate; fall back to CPU on machines/drivers where the
    // WebGL delegate fails to initialize, so tracking still works everywhere.
    try {
      this.landmarker = await make('GPU')
    } catch {
      this.landmarker = await make('CPU')
    }

    this.stream = await this.getStream(deviceId)

    this.video = document.createElement('video')
    this.video.srcObject = this.stream
    this.video.muted = true
    this.video.playsInline = true
    await this.video.play()

    this.running = true
    this.rafId = requestAnimationFrame(this.pump)
  }

  stop(): void {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.landmarker?.close()
    this.landmarker = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video = null
    this.lock.reset()
  }

  private pump = (): void => {
    if (!this.running) return
    this.rafId = requestAnimationFrame(this.pump)

    const lm = this.landmarker
    const video = this.video
    if (!lm || !video || video.readyState < 2) return

    const now = performance.now()
    const interval = now - this.lastFrameTs
    if (interval < 1000 / this.opts.targetFps) return
    this.lastFrameTs = now

    const t0 = performance.now()
    const result = lm.detectForVideo(video, now)
    const detectMs = performance.now() - t0

    const W = video.videoWidth || this.opts.width
    const H = video.videoHeight || this.opts.height
    const rawFaces: RawFace[] = (result.faceLandmarks ?? []).map(toRawFace)

    // Achieved detection rate = 1 / interval between processed frames.
    if (interval > 0 && interval < 2000) {
      const instFps = 1000 / interval
      this.fpsEma = this.fpsEma === 0 ? instFps : this.fpsEma * 0.9 + instFps * 0.1
    }

    const candidates: LockCandidate[] = rawFaces.map((f) => ({
      center: { x: f.box.x + f.box.width / 2, y: f.box.y + f.box.height / 2 },
      area: f.box.width * f.box.height
    }))
    const { lockedIndex, faceId } = this.lock.update(candidates)

    const faces: TrackedFace[] = rawFaces.map((f, i) => ({
      faceId: i === lockedIndex ? faceId : null,
      box: f.box,
      leftEye: f.leftEye,
      rightEye: f.rightEye,
      landmarks: f.landmarks,
      locked: i === lockedIndex
    }))

    let sample: ViewerSample | null = null
    if (lockedIndex !== null && faceId !== null) {
      const f = rawFaces[lockedIndex]
      // Viewpoint comes from blink-stable eye-corner midpoints, NOT the iris
      // (the iris is occluded by blinks and degrades first under yaw).
      const { left, right } = eyeCenters(f.landmarks)
      const dxPx = (right.x - left.x) * W
      const dyPx = (right.y - left.y) * H
      const interEyePx = Math.hypot(dxPx, dyPx)

      // Head yaw (for cos-correction of depth) + blink (for confidence) from the
      // locked face's transformation matrix and blendshapes.
      const yawDeg = headYawDeg(result.facialTransformationMatrixes?.[lockedIndex]?.data ?? [])
      const blink = blinkScore(result.faceBlendshapes?.[lockedIndex])

      sample = {
        eyeCenter: { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 },
        leftEye: left,
        rightEye: right,
        interEyeNorm: interEyePx / W,
        yawDeg,
        confidence: confidenceFrom(blink, yawDeg),
        faceId,
        timestamp: now
      }
    }

    const frame: TrackerFrame = {
      sample,
      faces,
      videoWidth: W,
      videoHeight: H,
      timestamp: now,
      detectMs,
      detectFps: this.fpsEma
    }
    this.callbacks.forEach((cb) => cb(frame))
  }
}

/** Blink amount [0..1] = the more-closed of the two eyes, from blendshapes. */
function blinkScore(
  blendshapes?: { categories?: { categoryName?: string; score: number }[] }
): number {
  const cats = blendshapes?.categories
  if (!cats) return 0
  let blink = 0
  for (const c of cats) {
    if (c.categoryName === 'eyeBlinkLeft' || c.categoryName === 'eyeBlinkRight') {
      if (c.score > blink) blink = c.score
    }
  }
  return blink
}

function toRawFace(landmarks: { x: number; y: number }[]): RawFace {
  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const l = landmarks[LEFT_IRIS_CENTER]
  const r = landmarks[RIGHT_IRIS_CENTER]
  return {
    box: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    leftEye: { x: l.x, y: l.y },
    rightEye: { x: r.x, y: r.y },
    landmarks: landmarks.map((p) => ({ x: p.x, y: p.y }))
  }
}
