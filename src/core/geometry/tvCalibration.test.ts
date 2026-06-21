import { describe, it, expect } from 'vitest'
import { CameraPlacement, ScreenGeometry, Vec3 } from '@shared/types'
import { applyPlacement, inverseApplyPlacement } from './cameraModel'
import {
  ProbeObservation,
  ScreenEdge,
  edgeResidual,
  projectMarkerToScreen,
  solvePlacement
} from './tvCalibration'

const SCREEN: ScreenGeometry = { widthMm: 1217, heightMm: 685 }

function place(over: Partial<CameraPlacement> = {}): CameraPlacement {
  return {
    position: { x: 0, y: 0, z: 0, ...over.position },
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    ...over
  }
}

/** A marker that grazes `edge` when viewed from screen-space eye `E` at depth mz. */
function makeMarker(E: Vec3, edge: ScreenEdge, mz: number): Vec3 {
  const t = E.z / (E.z - mz)
  const halfW = SCREEN.widthMm / 2
  const halfH = SCREEN.heightMm / 2
  switch (edge) {
    case 'right':
      return { x: E.x + (halfW - E.x) / t, y: 0, z: mz }
    case 'left':
      return { x: E.x + (-halfW - E.x) / t, y: 0, z: mz }
    case 'top':
      return { x: 0, y: E.y + (halfH - E.y) / t, z: mz }
    case 'bottom':
      return { x: 0, y: E.y + (-halfH - E.y) / t, z: mz }
  }
}

/** Build an observation: pick a viewer eye + marker, back out the camera-frame eye. */
function obsFrom(truth: CameraPlacement, E: Vec3, edge: ScreenEdge, mz: number): ProbeObservation {
  const marker = makeMarker(E, edge, mz)
  return { camEye: inverseApplyPlacement(E, truth), marker, edge }
}

describe('projectMarkerToScreen', () => {
  it('an on-axis marker seen from an on-axis eye projects to the screen center', () => {
    const p = projectMarkerToScreen({ x: 0, y: 0, z: 1000 }, { x: 0, y: 0, z: -500 })
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(0, 6)
  })

  it('moving the eye right slides a behind-glass marker projection right (same dir)', () => {
    // For a point behind the glass, the eye→marker ray hits the nearer screen
    // plane on the eye's side, so the projection tracks the eye. (This is why a
    // marker just outside the right edge appears as you sidestep LEFT, not right.)
    const a = projectMarkerToScreen({ x: 0, y: 0, z: 1000 }, { x: 0, y: 0, z: -500 })
    const b = projectMarkerToScreen({ x: 100, y: 0, z: 1000 }, { x: 0, y: 0, z: -500 })
    expect(b.x).toBeGreaterThan(a.x)
  })
})

describe('makeMarker / edgeResidual self-consistency', () => {
  it('a synthesized grazing marker has ~zero edge residual at its eye', () => {
    const E = { x: 120, y: 80, z: 1500 }
    for (const edge of ['left', 'right', 'top', 'bottom'] as ScreenEdge[]) {
      const marker = makeMarker(E, edge, -600)
      expect(edgeResidual(E, marker, edge, SCREEN)).toBeCloseTo(0, 6)
    }
  })
})

describe('solvePlacement', () => {
  // The constrained TV setup: camera centered, below & forward of the TV, tilted up.
  const truth = place({ position: { x: 0, y: -340, z: 120 }, pitchDeg: -6 })

  // A diverse probe set: top/bottom edges at two depths and distances (to separate
  // pitch from vertical offset), plus left/right for the lateral check.
  const observations: ProbeObservation[] = [
    obsFrom(truth, { x: 0, y: 300, z: 1200 }, 'top', -400),
    obsFrom(truth, { x: 0, y: -200, z: 1200 }, 'bottom', -400),
    obsFrom(truth, { x: 0, y: 250, z: 1800 }, 'top', -1500),
    obsFrom(truth, { x: 0, y: -250, z: 1800 }, 'bottom', -1500),
    obsFrom(truth, { x: 150, y: 100, z: 2000 }, 'top', -800),
    obsFrom(truth, { x: -150, y: -100, z: 2000 }, 'bottom', -800),
    obsFrom(truth, { x: 200, y: 50, z: 1500 }, 'right', -600),
    obsFrom(truth, { x: -200, y: 50, z: 1500 }, 'left', -600)
  ]

  it('recovers the true placement from a coarse seed', () => {
    const seed = place({ position: { x: 0, y: -300, z: 100 }, pitchDeg: 0 })
    const res = solvePlacement(observations, seed, SCREEN)

    expect(res.placement.position.y).toBeCloseTo(truth.position.y, 0) // within ~0.5mm
    expect(res.placement.position.z).toBeCloseTo(truth.position.z, 0)
    expect(res.placement.pitchDeg).toBeCloseTo(truth.pitchDeg, 1)
    expect(res.rmsResidualMm).toBeLessThan(0.5)
  })

  it('leaves constrained DOF (x, yaw, roll) pinned at the seed', () => {
    const seed = place({ position: { x: 0, y: -300, z: 100 } })
    const res = solvePlacement(observations, seed, SCREEN)
    expect(res.placement.position.x).toBe(0)
    expect(res.placement.yawDeg).toBe(0)
    expect(res.placement.rollDeg).toBe(0)
  })

  it('is a near no-op (tiny residual, few iters) when seeded at the truth', () => {
    const res = solvePlacement(observations, truth, SCREEN)
    expect(res.rmsResidualMm).toBeLessThan(0.5)
    expect(res.placement.position.y).toBeCloseTo(truth.position.y, 0)
  })

  it('returns the seed unchanged when under-determined', () => {
    const seed = place({ position: { x: 0, y: -300, z: 100 } })
    const res = solvePlacement(observations.slice(0, 2), seed, SCREEN, {
      free: ['y', 'z', 'pitch']
    })
    expect(res.iterations).toBe(0)
    expect(res.placement).toBe(seed)
  })
})

describe('cameraModel placement round-trip', () => {
  it('inverseApplyPlacement undoes applyPlacement', () => {
    const p = place({ position: { x: 10, y: -340, z: 120 }, yawDeg: 4, pitchDeg: -6, rollDeg: 2 })
    const rel = { x: -120, y: 80, z: 1500 }
    const back = inverseApplyPlacement(applyPlacement(rel, p), p)
    expect(back.x).toBeCloseTo(rel.x, 6)
    expect(back.y).toBeCloseTo(rel.y, 6)
    expect(back.z).toBeCloseTo(rel.z, 6)
  })
})
