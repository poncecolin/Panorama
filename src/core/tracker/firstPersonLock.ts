import { Vec2 } from '@shared/types'

/** Minimal shape the lock needs from a detection. */
export interface LockCandidate {
  center: Vec2
  /** Box area (normalized) — used to pick the nearest/largest on fresh acquire. */
  area: number
}

export interface LockConfig {
  /** Frames the locked face may be missing before the lock is released. */
  maxMissedFrames: number
  /**
   * Max allowed jump (normalized distance) between consecutive centers when
   * re-associating the locked face. Prevents snapping to a different person.
   */
  maxJumpNorm: number
}

export const DEFAULT_LOCK_CONFIG: LockConfig = {
  maxMissedFrames: 30,
  maxJumpNorm: 0.28
}

export interface LockResult {
  /** Index into the candidates array that is locked, or null. */
  lockedIndex: number | null
  /** Stable id of the locked face, or null. */
  faceId: number | null
}

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Locks onto the first person seen and keeps tracking THEM across frames, even
 * when other people appear. Pure and deterministic → unit-testable.
 *
 * Acquisition: with no current lock, the largest (closest) face is chosen.
 * Association: with a lock, the candidate nearest to the last known position
 * (within maxJumpNorm) keeps the lock; newcomers are ignored. After the locked
 * face is missing for maxMissedFrames, the lock releases and re-acquires.
 */
export class FirstPersonLock {
  private faceId: number | null = null
  private lastCenter: Vec2 | null = null
  private missed = 0
  private nextId = 1

  constructor(private config: LockConfig = DEFAULT_LOCK_CONFIG) {}

  reset(): void {
    this.faceId = null
    this.lastCenter = null
    this.missed = 0
  }

  get lockedId(): number | null {
    return this.faceId
  }

  update(candidates: LockCandidate[]): LockResult {
    // No detections this frame: count toward releasing the lock.
    if (candidates.length === 0) {
      if (this.faceId !== null) {
        this.missed += 1
        if (this.missed > this.config.maxMissedFrames) this.reset()
      }
      return { lockedIndex: null, faceId: this.faceId }
    }

    // Re-associate an existing lock to the nearest in-range candidate.
    if (this.faceId !== null && this.lastCenter !== null) {
      let bestIdx = -1
      let bestDist = Infinity
      for (let i = 0; i < candidates.length; i++) {
        const d = dist(candidates[i].center, this.lastCenter)
        if (d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      }
      if (bestIdx >= 0 && bestDist <= this.config.maxJumpNorm) {
        this.lastCenter = candidates[bestIdx].center
        this.missed = 0
        return { lockedIndex: bestIdx, faceId: this.faceId }
      }
      // Locked face not found among candidates this frame.
      this.missed += 1
      if (this.missed > this.config.maxMissedFrames) {
        this.reset()
        // fall through to acquire below
      } else {
        return { lockedIndex: null, faceId: this.faceId }
      }
    }

    // Fresh acquisition: pick the largest (closest) face.
    let pick = 0
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].area > candidates[pick].area) pick = i
    }
    this.faceId = this.nextId++
    this.lastCenter = candidates[pick].center
    this.missed = 0
    return { lockedIndex: pick, faceId: this.faceId }
  }
}
