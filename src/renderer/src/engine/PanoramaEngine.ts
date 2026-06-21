import { AppSettings, EyePose, TrackingState, Vec3 } from '@shared/types'
import { GeometryConfig, GeometrySolver } from '@core/geometry/GeometrySolver'
import { computeApproachDolly } from '@core/geometry/dolly'
import { ThreeRenderer } from '@core/render/ThreeRenderer'
import { MediaPipeFaceTracker } from '@core/tracker/MediaPipeFaceTracker'
import { TrackerFrame } from '@core/tracker/types'
import { ThreeScene } from '@scenes/types'
import { blendTarget, reacquireTau, resolveState, DEFAULT_LIFECYCLE } from './lifecycle'

export interface EngineStatus {
  state: TrackingState
  /** 0 = full attract drift, 1 = full viewer tracking. */
  blend: number
  eyeMm: Vec3
  frame: TrackerFrame | null
  renderFps: number
  /** Count of frames slower than ~30 fps (>33 ms) since start — render hitches. */
  slowFrames: number
  cameraError: string | null
}

export type StatusCallback = (s: EngineStatus) => void

/** Glide time constant (ms) for the smooth Tracking <-> Attract transition. */
const GLIDE_TAU_MS = 550

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  }
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function toGeometryConfig(s: AppSettings): GeometryConfig {
  return {
    intrinsics: s.intrinsics,
    placement: s.placement,
    screen: s.screen,
    viewer: s.viewer,
    tuning: s.tuning
  }
}

/**
 * Ties the pipeline together: camera → tracker → GeometrySolver → ThreeRenderer.
 *
 * Lifecycle is a single eased blend between the tracked eye (One-Euro smoothed)
 * and a cinematic attract drift, which yields the calm Tracking ⇄ glide ⇄ Attract
 * behavior: when the viewer is present blend → 1; when lost it eases → 0 and the
 * camera drifts along the scene's attract path. Re-acquisition eases back to 1.
 */
export class PanoramaEngine {
  private renderer = new ThreeRenderer()
  private solver: GeometrySolver
  private tracker: MediaPipeFaceTracker | null = null
  private scene: ThreeScene | null = null
  private settings: AppSettings

  /** Latest solved eye (the raw follow target). */
  private targetEye: Vec3 | null = null
  /** Eye actually shown — eased toward targetEye; glides (not snaps) on re-acquire. */
  private displayEye: Vec3 | null = null
  /** True while gliding back after a real loss (see lifecycle.reacquireTau). */
  private reacquiring = false
  private lastSampleMs = -Infinity
  private everTracked = false
  private blend = 0
  private latestFrame: TrackerFrame | null = null

  private raf = 0
  private lastFrameMs = 0
  private elapsedMs = 0
  private renderFps = 0
  private slowFrames = 0
  private statusAccum = 0
  private cameraError: string | null = null
  private callbacks = new Set<StatusCallback>()
  private unsubTracker: (() => void) | null = null

  constructor(settings: AppSettings) {
    this.settings = settings
    this.solver = new GeometrySolver(toGeometryConfig(settings))
  }

  onStatus(cb: StatusCallback): () => void {
    this.callbacks.add(cb)
    return () => this.callbacks.delete(cb)
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.tracker?.getVideoElement() ?? null
  }

  /** Most recent detection frame (for the calibration wizard's live capture). */
  getLatestFrame(): TrackerFrame | null {
    return this.latestFrame
  }

  async start(canvas: HTMLCanvasElement, scene: ThreeScene): Promise<void> {
    this.renderer.init(canvas)
    this.renderer.setScreen(this.settings.screen.widthMm, this.settings.screen.heightMm)
    this.resize(canvas)
    await this.renderer.loadScene(scene)
    this.scene = scene
    scene.setWindowHeightMm?.(this.settings.tuning.windowHeightMm)

    // Start the render loop immediately so attract mode shows even without a camera.
    this.lastFrameMs = performance.now()
    this.loop()

    // Start tracking; on failure (no camera / denied) stay in attract mode.
    this.tracker = new MediaPipeFaceTracker({ targetFps: 30 })
    this.unsubTracker = this.tracker.onFrame((f) => this.onTrackerFrame(f))
    try {
      await this.tracker.start()
    } catch (err) {
      this.cameraError = err instanceof Error ? err.message : String(err)
    }
  }

  async setScene(scene: ThreeScene): Promise<void> {
    await this.renderer.loadScene(scene)
    this.scene = scene
    scene.setWindowHeightMm?.(this.settings.tuning.windowHeightMm)
    this.elapsedMs = 0
  }

  updateSettings(settings: AppSettings): void {
    this.settings = settings
    this.solver.setConfig(toGeometryConfig(settings))
    this.renderer.setScreen(settings.screen.widthMm, settings.screen.heightMm)
    this.scene?.setWindowHeightMm?.(settings.tuning.windowHeightMm)
  }

  resize(canvas: HTMLCanvasElement): void {
    this.renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    this.unsubTracker?.()
    this.tracker?.stop()
    this.tracker = null
    this.renderer.dispose()
  }

  private onTrackerFrame(f: TrackerFrame): void {
    this.latestFrame = f
    if (f.sample) {
      const pose = this.solver.solve(f.sample)
      const now = performance.now()
      // If the viewer was gone long enough to count as a real loss (vs. a blink),
      // glide back to the new position instead of snapping — they may have moved
      // while turned away, and a teleport on return breaks the illusion.
      if (reacquireTau(now - this.lastSampleMs, DEFAULT_LIFECYCLE) > 0) this.reacquiring = true
      this.targetEye = pose.eyeMm
      this.lastSampleMs = now
      this.everTracked = true
    }
  }

  private attractEye(): Vec3 {
    if (this.scene?.attractEye) return this.scene.attractEye(this.elapsedMs).eye
    const t = this.elapsedMs / 1000
    return { x: Math.sin(t * 0.25) * 200, y: 30 + Math.sin(t * 0.17) * 50, z: 620 }
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min(now - this.lastFrameMs, 100)
    this.lastFrameMs = now
    this.elapsedMs += dt

    const instFps = dt > 0 ? 1000 / dt : 0
    this.renderFps = this.renderFps === 0 ? instFps : this.renderFps * 0.9 + instFps * 0.1
    if (dt > 33) this.slowFrames++

    // Ease the tracking<->attract blend toward its target. While the viewer is
    // only briefly lost (within the hold window), the target stays 1 and the eye
    // is held at its last position — so a quick turn-away never jumps to attract.
    const lostMs = now - this.lastSampleMs
    const target = blendTarget(lostMs, DEFAULT_LIFECYCLE)
    const k = 1 - Math.exp(-dt / GLIDE_TAU_MS)
    this.blend += (target - this.blend) * k

    // Ease the displayed tracked eye toward the latest sample. Steady tracking
    // follows exactly (the solver already smooths); after a real loss we glide
    // over reacquireTauMs until within ~1 mm, so the return reads as a move, not
    // a jump.
    if (this.targetEye) {
      if (!this.displayEye) {
        this.displayEye = this.targetEye
        this.reacquiring = false
      } else if (this.reacquiring) {
        const ke = 1 - Math.exp(-dt / DEFAULT_LIFECYCLE.reacquireTauMs)
        this.displayEye = lerp(this.displayEye, this.targetEye, ke)
        if (dist(this.displayEye, this.targetEye) < 1) this.reacquiring = false
      } else {
        this.displayEye = this.targetEye
      }
    }

    const attract = this.attractEye()
    const tracked = this.displayEye ?? attract
    const eye = lerp(attract, tracked, this.blend)

    const pose: EyePose = this.solver.poseFromEye(eye, this.blend > 0.5)
    this.renderer.setEyePose(pose)
    const tuning = this.settings.tuning
    this.renderer.setSceneDollyZ(
      computeApproachDolly(eye.z, tuning.approachRestMm, tuning.approachDollyGain)
    )
    this.renderer.render(dt)

    // Emit status at ~15 Hz to avoid flooding React.
    this.statusAccum += dt
    if (this.statusAccum >= 66) {
      this.statusAccum = 0
      this.emitStatus(eye)
    }
  }

  private emitStatus(eye: Vec3): void {
    const lostMs = performance.now() - this.lastSampleMs
    const state = resolveState(this.everTracked, lostMs, this.blend, DEFAULT_LIFECYCLE)

    const status: EngineStatus = {
      state,
      blend: this.blend,
      eyeMm: eye,
      frame: this.latestFrame,
      renderFps: this.renderFps,
      slowFrames: this.slowFrames,
      cameraError: this.cameraError
    }
    this.callbacks.forEach((cb) => cb(status))
  }
}
