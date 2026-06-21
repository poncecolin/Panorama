import { describe, it, expect } from 'vitest'
import { GeometrySolver, GeometryConfig } from './GeometrySolver'
import { ViewerSample } from '@shared/types'

const FOV = 65
const focalNorm = 0.5 / Math.tan((FOV * Math.PI) / 180 / 2)

function makeConfig(overrides: Partial<GeometryConfig> = {}): GeometryConfig {
  return {
    intrinsics: { horizontalFovDeg: FOV, frameWidth: 640, frameHeight: 480 },
    placement: {
      position: { x: 0, y: 0, z: 0 },
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0
    },
    screen: { widthMm: 300, heightMm: 200 },
    viewer: { ipdMm: 63 },
    tuning: {
      oneEuroMinCutoff: 1,
      oneEuroBeta: 0.02,
      parallaxGain: 1,
      approachDollyGain: 6,
      approachRestMm: 600,
      windowHeightMm: 500,
      nearPlaneMm: 50,
      farPlaneMm: 100000,
      freeze: false,
      yawCosFloor: 0.5,
      confidenceFreeze: 0.35,
      lowConfMinCutoff: 0.3,
      jumpGateMmPerSec: 4000
    },
    ...overrides
  }
}

/** interEyeNorm that yields a target depth (mm) for the centered case. */
function interEyeForDepth(depthMm: number, ipd = 63): number {
  return (focalNorm * ipd) / depthMm
}

function sample(over: Partial<ViewerSample> = {}): ViewerSample {
  return {
    eyeCenter: { x: 0.5, y: 0.5 },
    leftEye: { x: 0.45, y: 0.5 },
    rightEye: { x: 0.55, y: 0.5 },
    interEyeNorm: interEyeForDepth(600),
    confidence: 1,
    faceId: 1,
    timestamp: 0,
    ...over
  }
}

describe('GeometrySolver.rawEye', () => {
  it('recovers depth from inter-eye distance for a centered face', () => {
    const s = new GeometrySolver(makeConfig())
    const eye = s.rawEye(sample({ interEyeNorm: interEyeForDepth(700) }))
    expect(eye.x).toBeCloseTo(0, 3)
    expect(eye.y).toBeCloseTo(0, 3)
    expect(eye.z).toBeCloseTo(700, 0)
  })

  it('maps a face on the image-left to the viewer moving to their right (+X)', () => {
    const s = new GeometrySolver(makeConfig())
    const eye = s.rawEye(sample({ eyeCenter: { x: 0.3, y: 0.5 } }))
    expect(eye.x).toBeGreaterThan(0)
  })

  it('maps a face higher in the image to the viewer moving up (+Y)', () => {
    const s = new GeometrySolver(makeConfig())
    const eye = s.rawEye(sample({ eyeCenter: { x: 0.5, y: 0.3 } }))
    expect(eye.y).toBeGreaterThan(0)
  })

  it('clamps implausibly small depth to the minimum', () => {
    const s = new GeometrySolver(makeConfig())
    const eye = s.rawEye(sample({ interEyeNorm: 1 })) // huge apparent eyes → very close
    expect(eye.z).toBeCloseTo(150, 0)
  })

  it('parallaxGain scales lateral movement', () => {
    const base = new GeometrySolver(makeConfig())
    const gained = new GeometrySolver(
      makeConfig({
        tuning: { ...makeConfig().tuning, parallaxGain: 2 }
      })
    )
    const s = sample({ eyeCenter: { x: 0.3, y: 0.5 } })
    expect(gained.rawEye(s).x).toBeCloseTo(2 * base.rawEye(s).x, 3)
  })

  it('applies the camera placement offset (camera above screen center)', () => {
    const s = new GeometrySolver(
      makeConfig({
        placement: {
          position: { x: 0, y: 108, z: 0 },
          yawDeg: 0,
          pitchDeg: 0,
          rollDeg: 0
        }
      })
    )
    const eye = s.rawEye(sample())
    expect(eye.y).toBeCloseTo(108, 3) // centered face → eye sits at camera height
  })
})

describe('GeometrySolver.solve (projection)', () => {
  it('produces a symmetric frustum when the eye is centered', () => {
    const s = new GeometrySolver(makeConfig())
    const pose = s.solve(sample())
    expect(pose.tracked).toBe(true)
    expect(pose.projection[8]).toBeCloseTo(0, 6) // x-skew
    expect(pose.projection[9]).toBeCloseTo(0, 6) // y-skew
  })

  it('skews the frustum by -eyeX/halfWidth when the eye moves laterally', () => {
    const s = new GeometrySolver(makeConfig())
    const pose = s.solve(sample({ eyeCenter: { x: 0.3, y: 0.5 } }))
    const expected = -pose.eyeMm.x / (300 / 2)
    expect(pose.projection[8]).toBeCloseTo(expected, 5)
  })

  it('neutral pose is head-on, centered, and flagged untracked', () => {
    const s = new GeometrySolver(makeConfig())
    const pose = s.solveNeutral(600)
    expect(pose.tracked).toBe(false)
    expect(pose.eyeMm.x).toBe(0)
    expect(pose.eyeMm.z).toBe(600)
    expect(pose.projection[8]).toBeCloseTo(0, 6)
  })

  it('a constant sample stream yields a stable (non-drifting) filtered eye', () => {
    const s = new GeometrySolver(makeConfig())
    const a = s.solve(sample({ timestamp: 0 }))
    const b = s.solve(sample({ timestamp: 33 }))
    const c = s.solve(sample({ timestamp: 66 }))
    expect(b.eyeMm.z).toBeCloseTo(a.eyeMm.z, 3)
    expect(c.eyeMm.z).toBeCloseTo(a.eyeMm.z, 3)
  })
})

describe('GeometrySolver tracking robustness', () => {
  it('cos-corrects depth so a yawed face is not read as farther away', () => {
    const s = new GeometrySolver(makeConfig())
    const frontal = interEyeForDepth(600)
    const yaw = 40
    // Yaw foreshortens the apparent inter-eye distance by cos(yaw).
    const apparent = frontal * Math.cos((yaw * Math.PI) / 180)

    const corrected = s.rawEye(sample({ interEyeNorm: apparent, yawDeg: yaw }))
    expect(corrected.z).toBeCloseTo(600, 0)

    // Without the yaw cue the same apparent size reads as much farther away.
    const uncorrected = s.rawEye(sample({ interEyeNorm: apparent }))
    expect(uncorrected.z).toBeGreaterThan(corrected.z + 50)
  })

  it('holds the last eye through a low-confidence (blink) sample', () => {
    const s = new GeometrySolver(makeConfig())
    const good = s.solve(sample({ timestamp: 0, confidence: 1 }))
    // Blink: garbage position but low confidence → should be ignored, view held.
    const held = s.solve(
      sample({ timestamp: 33, confidence: 0.1, eyeCenter: { x: 0.2, y: 0.2 } })
    )
    expect(held.eyeMm.x).toBeCloseTo(good.eyeMm.x, 6)
    expect(held.eyeMm.y).toBeCloseTo(good.eyeMm.y, 6)
    expect(held.eyeMm.z).toBeCloseTo(good.eyeMm.z, 6)
  })

  it('gates an implausibly fast jump (outlier) and holds instead of snapping', () => {
    const s = new GeometrySolver(makeConfig())
    const a = s.solve(sample({ timestamp: 0 }))
    // 1 ms later, a large lateral jump → absurd implied speed → treated as outlier.
    const b = s.solve(sample({ timestamp: 1, confidence: 1, eyeCenter: { x: 0.05, y: 0.5 } }))
    expect(b.eyeMm.x).toBeCloseTo(a.eyeMm.x, 3)
  })

  it('recovers when the viewer relocates while held (e.g. after spinning around)', () => {
    const s = new GeometrySolver(makeConfig())
    // Baseline eye on one side.
    s.solve(sample({ timestamp: 0, eyeCenter: { x: 0.7, y: 0.5 }, confidence: 1 }))
    // The viewer reappears at a very different spot, confidently, every ~33 ms.
    // The first frames are gated as outliers, but it must NOT hold forever.
    let last = s.solve(sample({ timestamp: 33, eyeCenter: { x: 0.3, y: 0.5 }, confidence: 1 }))
    for (let i = 2; i <= 10; i++) {
      last = s.solve(sample({ timestamp: i * 33, eyeCenter: { x: 0.3, y: 0.5 }, confidence: 1 }))
    }
    const target = s.rawEye(sample({ eyeCenter: { x: 0.3, y: 0.5 } }))
    expect(last.eyeMm.x).toBeCloseTo(target.x, 0)
  })

  it('still tracks normal-speed motion (does not over-gate)', () => {
    const s = new GeometrySolver(makeConfig())
    s.solve(sample({ timestamp: 0, eyeCenter: { x: 0.5, y: 0.5 } }))
    // A modest move over a normal frame interval should be followed, not frozen.
    const moved = s.solve(sample({ timestamp: 33, eyeCenter: { x: 0.45, y: 0.5 } }))
    expect(moved.eyeMm.x).toBeGreaterThan(0)
  })
})
