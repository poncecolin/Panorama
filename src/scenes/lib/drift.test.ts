import { describe, it, expect } from 'vitest'
import { sinusoidalDrift } from './drift'

const OPTS = { xAmp: 240, xFreq: 0.18, yBase: 60, yAmp: 70, yFreq: 0.12, z: 640 }

describe('sinusoidalDrift', () => {
  it('is deterministic in elapsed time', () => {
    expect(sinusoidalDrift(1234, OPTS)).toEqual(sinusoidalDrift(1234, OPTS))
  })

  it('starts centred in X and at the base height, at the fixed distance', () => {
    const { eye } = sinusoidalDrift(0, OPTS)
    expect(eye.x).toBeCloseTo(0)
    expect(eye.y).toBeCloseTo(OPTS.yBase)
    expect(eye.z).toBe(OPTS.z)
  })

  it('stays within the configured amplitude envelope', () => {
    for (let ms = 0; ms < 60_000; ms += 250) {
      const { eye } = sinusoidalDrift(ms, OPTS)
      expect(Math.abs(eye.x)).toBeLessThanOrEqual(OPTS.xAmp + 1e-9)
      expect(eye.y).toBeGreaterThanOrEqual(OPTS.yBase - OPTS.yAmp - 1e-9)
      expect(eye.y).toBeLessThanOrEqual(OPTS.yBase + OPTS.yAmp + 1e-9)
      expect(eye.z).toBe(OPTS.z)
    }
  })
})
