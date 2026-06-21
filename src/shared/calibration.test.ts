import { describe, it, expect } from 'vitest'
import { screenMmFromDiagonal, fovFromObservation } from './calibration'

describe('screenMmFromDiagonal', () => {
  it('computes 16:9 sizes for a 15.6" laptop', () => {
    const { widthMm, heightMm } = screenMmFromDiagonal(15.6, 16, 9)
    expect(widthMm).toBeCloseTo(345.4, 0)
    expect(heightMm).toBeCloseTo(194.3, 0)
    // diagonal is preserved
    expect(Math.hypot(widthMm, heightMm)).toBeCloseTo(15.6 * 25.4, 1)
  })

  it('aspect can be passed as raw pixel resolution', () => {
    const a = screenMmFromDiagonal(13.3, 2560, 1600)
    const b = screenMmFromDiagonal(13.3, 16, 10)
    expect(a.widthMm).toBeCloseTo(b.widthMm, 6)
  })
})

describe('fovFromObservation', () => {
  it('recovers the FOV that generated an observation (round-trip)', () => {
    const fov = 65
    const focalNorm = 0.5 / Math.tan((fov * Math.PI) / 180 / 2)
    const ipd = 63
    const depth = 600
    const interEyeNorm = (focalNorm * ipd) / depth
    expect(fovFromObservation(depth, interEyeNorm, ipd)).toBeCloseTo(65, 1)
  })

  it('clamps implausible observations to the lens range', () => {
    expect(fovFromObservation(600, 0.0001, 63)).toBe(110)
    expect(fovFromObservation(600, 5, 63)).toBe(40)
  })
})
