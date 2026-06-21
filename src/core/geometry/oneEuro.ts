import { Vec3 } from '@shared/types'

/**
 * One Euro filter (Casiez et al., 2012): low-latency adaptive smoothing.
 * At low speeds it filters jitter hard; at high speeds it reduces lag. Ideal for
 * head tracking where both steadiness and responsiveness matter.
 */
class OneEuroScalar {
  private xPrev: number | null = null
  private dxPrev = 0
  private tPrev = 0

  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff = 1.0
  ) {}

  setParams(minCutoff: number, beta: number): void {
    this.minCutoff = minCutoff
    this.beta = beta
  }

  reset(): void {
    this.xPrev = null
    this.dxPrev = 0
  }

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  /**
   * @param t timestamp in seconds.
   * @param minCutoffOverride transient min-cutoff for this call only (the
   *   persistent param is untouched). Lets the caller smooth harder for one
   *   frame when the sample is low-confidence, without re-tuning the filter.
   */
  filter(x: number, t: number, minCutoffOverride?: number): number {
    if (this.xPrev === null) {
      this.xPrev = x
      this.tPrev = t
      return x
    }
    const dt = Math.max(t - this.tPrev, 1e-4)
    this.tPrev = t

    const dx = (x - this.xPrev) / dt
    const aD = OneEuroScalar.alpha(this.dCutoff, dt)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    this.dxPrev = dxHat

    const minCutoff = minCutoffOverride ?? this.minCutoff
    const cutoff = minCutoff + this.beta * Math.abs(dxHat)
    const a = OneEuroScalar.alpha(cutoff, dt)
    const xHat = a * x + (1 - a) * this.xPrev
    this.xPrev = xHat
    return xHat
  }
}

/** One Euro filter over a 3D vector. */
export class Vec3OneEuro {
  private fx: OneEuroScalar
  private fy: OneEuroScalar
  private fz: OneEuroScalar

  constructor(minCutoff: number, beta: number, dCutoff = 1.0) {
    this.fx = new OneEuroScalar(minCutoff, beta, dCutoff)
    this.fy = new OneEuroScalar(minCutoff, beta, dCutoff)
    this.fz = new OneEuroScalar(minCutoff, beta, dCutoff)
  }

  setParams(minCutoff: number, beta: number): void {
    this.fx.setParams(minCutoff, beta)
    this.fy.setParams(minCutoff, beta)
    this.fz.setParams(minCutoff, beta)
  }

  reset(): void {
    this.fx.reset()
    this.fy.reset()
    this.fz.reset()
  }

  /**
   * @param tSeconds timestamp in seconds.
   * @param minCutoffOverride transient min-cutoff for this call only (see scalar).
   */
  filter(v: Vec3, tSeconds: number, minCutoffOverride?: number): Vec3 {
    return {
      x: this.fx.filter(v.x, tSeconds, minCutoffOverride),
      y: this.fy.filter(v.y, tSeconds, minCutoffOverride),
      z: this.fz.filter(v.z, tSeconds, minCutoffOverride)
    }
  }
}
