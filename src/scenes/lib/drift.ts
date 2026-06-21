import { AttractSample } from '../types'

/** Per-scene shape of the cinematic attract-mode camera drift. */
export interface DriftOptions {
  /** Horizontal sway amplitude (mm) and rate (rad/s). */
  xAmp: number
  xFreq: number
  /** Vertical bob: centre height (mm), amplitude (mm), rate (rad/s). */
  yBase: number
  yAmp: number
  yFreq: number
  /** Fixed viewing distance from the glass (mm). */
  z: number
}

/**
 * A slow, smooth Lissajous-style eye drift used when no viewer is tracked. The
 * X/Y sinusoids run at different rates so the path never visibly repeats, and the
 * result is fed through the same off-axis projection as a real viewer — so attract
 * mode shows genuine parallax, not a flat pan. Deterministic in `elapsedMs`.
 */
export function sinusoidalDrift(elapsedMs: number, o: DriftOptions): AttractSample {
  const t = elapsedMs / 1000
  return {
    eye: {
      x: Math.sin(t * o.xFreq) * o.xAmp,
      y: o.yBase + Math.sin(t * o.yFreq) * o.yAmp,
      z: o.z
    }
  }
}
