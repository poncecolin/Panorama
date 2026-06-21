import { describe, it, expect } from 'vitest'
import { Vec2 } from '@shared/types'
import { eyeCenters, headYawDeg, confidenceFrom, EYE_CORNERS } from './faceGeometry'

/** Build a sparse landmark array with only the eye-corner indices populated. */
function withCorners(
  lOuter: Vec2,
  lInner: Vec2,
  rInner: Vec2,
  rOuter: Vec2
): Vec2[] {
  const lm: Vec2[] = new Array(478).fill({ x: 0, y: 0 })
  lm[EYE_CORNERS.left.outer] = lOuter
  lm[EYE_CORNERS.left.inner] = lInner
  lm[EYE_CORNERS.right.inner] = rInner
  lm[EYE_CORNERS.right.outer] = rOuter
  return lm
}

/** Column-major 4×4 pure yaw rotation Ry(deg). */
function yawMatrix(deg: number): number[] {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  // column-major: col0, col1, col2, col3
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]
}

describe('eyeCenters', () => {
  it('places each eye center at the midpoint of its corners', () => {
    const lm = withCorners(
      { x: 0.40, y: 0.50 },
      { x: 0.46, y: 0.50 },
      { x: 0.54, y: 0.50 },
      { x: 0.60, y: 0.50 }
    )
    const { left, right } = eyeCenters(lm)
    expect(left.x).toBeCloseTo(0.43, 6)
    expect(right.x).toBeCloseTo(0.57, 6)
    expect(left.y).toBeCloseTo(0.5, 6)
  })
})

describe('headYawDeg', () => {
  it('recovers the yaw angle from a pure-yaw matrix', () => {
    expect(headYawDeg(yawMatrix(0))).toBeCloseTo(0, 4)
    expect(headYawDeg(yawMatrix(30))).toBeCloseTo(30, 3)
    expect(headYawDeg(yawMatrix(-45))).toBeCloseTo(-45, 3)
  })

  it('returns 0 for a missing/short matrix', () => {
    expect(headYawDeg([])).toBe(0)
  })
})

describe('confidenceFrom', () => {
  it('is 1 for a clean, front-facing, open-eyed face', () => {
    expect(confidenceFrom(0, 0)).toBeCloseTo(1, 6)
  })

  it('collapses toward 0 for a full blink', () => {
    expect(confidenceFrom(1, 0)).toBeCloseTo(0, 6)
  })

  it('collapses toward 0 for extreme yaw (sign-agnostic)', () => {
    expect(confidenceFrom(0, 70)).toBeCloseTo(0, 6)
    expect(confidenceFrom(0, -70)).toBeCloseTo(0, 6)
  })

  it('decreases monotonically as yaw grows', () => {
    const a = confidenceFrom(0, 20)
    const b = confidenceFrom(0, 40)
    const c = confidenceFrom(0, 55)
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
  })
})
