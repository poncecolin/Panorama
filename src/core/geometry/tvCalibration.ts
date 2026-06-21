/**
 * TV-mode calibration: recover the camera→screen placement when the camera (the
 * laptop's) is no longer glued to the display.
 *
 * The trick is to use the VIEWER as a measurement probe. With an off-axis frustum,
 * a virtual marker placed just behind the glass appears/disappears at a screen
 * edge exactly when the eye crosses a specific plane. So "sidestep until the cube
 * grazes the edge" is a geometric constraint, not a guess: at the trigger we know
 * the marker's screen-space position and which edge it touched, and the tracker
 * gives the eye in the CAMERA frame. Each event constrains the unknown placement;
 * a few events solve it.
 *
 * Solver: damped Gauss–Newton (Levenberg–Marquardt) over a configurable subset of
 * placement DOF, seeded from the coarse measured guess. The constrained Phase-2
 * setup frees only {y, z, pitch} (x/yaw/roll pinned at 0), but the same routine
 * extends to full 6-DOF for arbitrary placement later — just widen `free`.
 *
 * All screen-space mm, conventions per cameraModel.ts.
 */
import { CameraPlacement, ScreenEdge, ScreenGeometry, Vec3 } from '@shared/types'
import { applyPlacement } from './cameraModel'

export type { ScreenEdge }
export type PlacementParam = 'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'roll'

/**
 * A captured probe event: at the instant a marker grazed a screen edge, the eye
 * position in the CAMERA frame (from `cameraFrameEye` — independent of placement),
 * the marker's screen-space position, and which edge it touched.
 */
export interface ProbeObservation {
  camEye: Vec3
  marker: Vec3
  edge: ScreenEdge
}

export interface SolveOptions {
  /** Which placement DOF to optimize. Default: the constrained TV set. */
  free?: PlacementParam[]
  /** Max Gauss–Newton iterations. */
  iterations?: number
  /** Levenberg–Marquardt damping (relative). */
  lambda?: number
}

export interface SolveResult {
  placement: CameraPlacement
  /** RMS of the per-observation edge residuals (mm) at the solution. */
  rmsResidualMm: number
  iterations: number
}

const DEFAULT_FREE: PlacementParam[] = ['y', 'z', 'pitch']

/**
 * Screen-space position of a marker at depth `mz` (behind the glass) that grazes
 * `edge` when viewed from screen-space eye `E`. Used to lay out probe markers for
 * a nominal viewer so a small head move brings them to the edge.
 */
export function grazingMarker(
  E: Vec3,
  edge: ScreenEdge,
  mz: number,
  screen: ScreenGeometry
): Vec3 {
  const t = E.z / (E.z - mz)
  const halfW = screen.widthMm / 2
  const halfH = screen.heightMm / 2
  switch (edge) {
    case 'right':
      return { x: E.x + (halfW - E.x) / t, y: E.y, z: mz }
    case 'left':
      return { x: E.x + (-halfW - E.x) / t, y: E.y, z: mz }
    case 'top':
      return { x: E.x, y: E.y + (halfH - E.y) / t, z: mz }
    case 'bottom':
      return { x: E.x, y: E.y + (-halfH - E.y) / t, z: mz }
  }
}

/**
 * Where a marker projects onto the screen plane (z = 0) as seen from the eye.
 * Intersect the eye→marker ray with z = 0. The marker is behind the glass
 * (marker.z < 0) and the eye in front (eye.z > 0), so the hit is between them.
 */
export function projectMarkerToScreen(eye: Vec3, marker: Vec3): { x: number; y: number } {
  const denom = eye.z - marker.z
  const t = Math.abs(denom) < 1e-6 ? 0 : eye.z / denom
  return {
    x: eye.x + t * (marker.x - eye.x),
    y: eye.y + t * (marker.y - eye.y)
  }
}

/**
 * Signed distance (mm) from a marker's screen projection to the target edge.
 * Zero when the marker grazes that edge — the calibration trigger condition.
 */
export function edgeResidual(
  eye: Vec3,
  marker: Vec3,
  edge: ScreenEdge,
  screen: ScreenGeometry
): number {
  const p = projectMarkerToScreen(eye, marker)
  const halfW = screen.widthMm / 2
  const halfH = screen.heightMm / 2
  switch (edge) {
    case 'right':
      return p.x - halfW
    case 'left':
      return p.x + halfW
    case 'top':
      return p.y - halfH
    case 'bottom':
      return p.y + halfH
  }
}

function getParam(p: CameraPlacement, k: PlacementParam): number {
  switch (k) {
    case 'x':
      return p.position.x
    case 'y':
      return p.position.y
    case 'z':
      return p.position.z
    case 'yaw':
      return p.yawDeg
    case 'pitch':
      return p.pitchDeg
    case 'roll':
      return p.rollDeg
  }
}

function withParam(p: CameraPlacement, k: PlacementParam, v: number): CameraPlacement {
  const next: CameraPlacement = {
    position: { ...p.position },
    yawDeg: p.yawDeg,
    pitchDeg: p.pitchDeg,
    rollDeg: p.rollDeg
  }
  switch (k) {
    case 'x':
      next.position.x = v
      break
    case 'y':
      next.position.y = v
      break
    case 'z':
      next.position.z = v
      break
    case 'yaw':
      next.yawDeg = v
      break
    case 'pitch':
      next.pitchDeg = v
      break
    case 'roll':
      next.rollDeg = v
      break
  }
  return next
}

/** All edge residuals for a candidate placement (mm). */
function residuals(
  placement: CameraPlacement,
  obs: ProbeObservation[],
  screen: ScreenGeometry
): number[] {
  return obs.map((o) => {
    const eye = applyPlacement(o.camEye, placement)
    return edgeResidual(eye, o.marker, o.edge, screen)
  })
}

function rms(r: number[]): number {
  if (r.length === 0) return 0
  return Math.sqrt(r.reduce((s, v) => s + v * v, 0) / r.length)
}

/** Solve a small dense linear system A·x = b by Gaussian elimination with pivoting. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  // Full elimination leaves M diagonal: x[i] = rhs[i] / diag[i].
  return M.map((row, i) => row[n] / row[i])
}

/**
 * Recover the camera placement from probe observations, seeded by `seed` (the
 * coarse measured guess). Returns the refined placement plus the residual RMS so
 * callers can warn / fall back to the manual fine-tune if the fit is poor.
 */
export function solvePlacement(
  obs: ProbeObservation[],
  seed: CameraPlacement,
  screen: ScreenGeometry,
  options: SolveOptions = {}
): SolveResult {
  const free = options.free ?? DEFAULT_FREE
  const maxIter = options.iterations ?? 40
  const n = free.length
  // Finite-difference steps per param type (mm for translation, deg for angles).
  const step = (k: PlacementParam): number => (k === 'x' || k === 'y' || k === 'z' ? 1 : 0.25)
  const applyDelta = (p: CameraPlacement, d: number[]): CameraPlacement => {
    let next = p
    for (let j = 0; j < n; j++) next = withParam(next, free[j], getParam(next, free[j]) + d[j])
    return next
  }

  let placement = seed
  let r = residuals(placement, obs, screen)
  let cost = rms(r)
  let iters = 0
  let lambda = options.lambda ?? 1e-3

  // Need at least as many constraints as unknowns to be determined.
  if (obs.length < n) {
    return { placement, rmsResidualMm: cost, iterations: 0 }
  }

  for (let it = 0; it < maxIter; it++) {
    iters = it + 1

    // Numerical Jacobian J (rows = observations, cols = free params).
    const J: number[][] = r.map(() => new Array(n).fill(0))
    for (let j = 0; j < n; j++) {
      const k = free[j]
      const h = step(k)
      const rb = residuals(withParam(placement, k, getParam(placement, k) + h), obs, screen)
      for (let i = 0; i < r.length; i++) J[i][j] = (rb[i] - r[i]) / h
    }

    // Normal equations pieces: JᵀJ and Jᵀr.
    const JtJ: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
    const Jtr: number[] = new Array(n).fill(0)
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        let s = 0
        for (let i = 0; i < r.length; i++) s += J[i][a] * J[i][b]
        JtJ[a][b] = s
      }
      let s = 0
      for (let i = 0; i < r.length; i++) s += J[i][a] * r[i]
      Jtr[a] = s
    }

    // Levenberg–Marquardt: try a damped step; if it doesn't improve, increase
    // damping and retry (toward gradient descent); if it does, accept and relax.
    let stepTaken = false
    for (let tries = 0; tries < 8; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * (v || 1) : v)))
      const delta = solveLinear(
        A,
        Jtr.map((v) => -v)
      )
      if (!delta) {
        lambda *= 8
        continue
      }
      const next = applyDelta(placement, delta)
      const rn = residuals(next, obs, screen)
      const costN = rms(rn)
      if (costN < cost) {
        const improved = cost - costN
        placement = next
        r = rn
        cost = costN
        lambda = Math.max(lambda * 0.5, 1e-9)
        stepTaken = true
        if (improved < 1e-5) return { placement, rmsResidualMm: cost, iterations: iters }
        break
      }
      lambda *= 8
    }
    if (!stepTaken) break // damping maxed out — can't do better
  }

  return { placement, rmsResidualMm: cost, iterations: iters }
}
