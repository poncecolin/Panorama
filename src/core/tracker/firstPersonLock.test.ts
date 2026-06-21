import { describe, it, expect } from 'vitest'
import { FirstPersonLock, LockCandidate } from './firstPersonLock'

const face = (x: number, y: number, area = 0.05): LockCandidate => ({
  center: { x, y },
  area
})

describe('FirstPersonLock', () => {
  it('acquires the largest (closest) face first', () => {
    const lock = new FirstPersonLock()
    const r = lock.update([face(0.2, 0.5, 0.02), face(0.7, 0.5, 0.09)])
    expect(r.lockedIndex).toBe(1)
    expect(r.faceId).toBe(1)
  })

  it('keeps the locked person across small movement', () => {
    const lock = new FirstPersonLock()
    lock.update([face(0.5, 0.5)])
    const r = lock.update([face(0.55, 0.52)])
    expect(r.lockedIndex).toBe(0)
    expect(r.faceId).toBe(1)
  })

  it('ignores a newcomer and stays on the first person', () => {
    const lock = new FirstPersonLock()
    lock.update([face(0.3, 0.5)]) // first person acquired (id 1)
    // Newcomer appears at 0.8, larger; first person still near 0.32.
    const r = lock.update([face(0.32, 0.5, 0.04), face(0.8, 0.5, 0.2)])
    expect(r.faceId).toBe(1)
    // Locked index must be the one near the original position (index 0).
    expect(r.lockedIndex).toBe(0)
  })

  it('does not snap to a candidate beyond maxJumpNorm', () => {
    const lock = new FirstPersonLock({ maxMissedFrames: 30, maxJumpNorm: 0.1 })
    lock.update([face(0.2, 0.5)])
    // Only a far candidate present — too far to associate.
    const r = lock.update([face(0.9, 0.5)])
    expect(r.lockedIndex).toBeNull()
    // Lock not yet released (within missed budget).
    expect(r.faceId).toBe(1)
  })

  it('releases after the locked face is missing too long, then re-acquires', () => {
    const lock = new FirstPersonLock({ maxMissedFrames: 3, maxJumpNorm: 0.2 })
    lock.update([face(0.2, 0.5)]) // id 1
    for (let i = 0; i < 4; i++) lock.update([]) // exceed missed budget
    expect(lock.lockedId).toBeNull()
    const r = lock.update([face(0.8, 0.5)]) // re-acquire → new id
    expect(r.faceId).toBe(2)
    expect(r.lockedIndex).toBe(0)
  })
})
