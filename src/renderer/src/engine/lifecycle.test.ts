import { describe, it, expect } from 'vitest'
import { TrackingState } from '@shared/types'
import { blendTarget, reacquireTau, resolveState, DEFAULT_LIFECYCLE } from './lifecycle'

const cfg = DEFAULT_LIFECYCLE // holdMs 20000, activeMs 500

describe('blendTarget', () => {
  it('stays at 1 through the whole hold window (no early attract)', () => {
    expect(blendTarget(0, cfg)).toBe(1)
    expect(blendTarget(5000, cfg)).toBe(1)
    expect(blendTarget(19999, cfg)).toBe(1)
  })
  it('drops to 0 only after the hold window', () => {
    expect(blendTarget(20001, cfg)).toBe(0)
  })
})

describe('resolveState', () => {
  it('is Acquiring before the first viewer', () => {
    expect(resolveState(false, 1e9, 0, cfg)).toBe(TrackingState.Acquiring)
  })
  it('is Tracking while the viewer is present', () => {
    expect(resolveState(true, 100, 1, cfg)).toBe(TrackingState.Tracking)
  })
  it('HOLDS (not glide) on a brief loss like turning away', () => {
    expect(resolveState(true, 3000, 1, cfg)).toBe(TrackingState.Holding)
    expect(resolveState(true, 19000, 1, cfg)).toBe(TrackingState.Holding)
  })
  it('glides to attract only after the hold window', () => {
    expect(resolveState(true, 21000, 0.7, cfg)).toBe(TrackingState.GlideToAttract)
    expect(resolveState(true, 60000, 0.0, cfg)).toBe(TrackingState.Attract)
  })
  it('glides back to tracking when the viewer returns', () => {
    expect(resolveState(true, 100, 0.4, cfg)).toBe(TrackingState.GlideToTrack)
  })
})

describe('reacquireTau', () => {
  it('is 0 (instant catch-up) for a brief gap like a blink', () => {
    expect(reacquireTau(0, cfg)).toBe(0)
    expect(reacquireTau(cfg.activeMs, cfg)).toBe(0)
  })
  it('glides over reacquireTauMs after a real loss', () => {
    expect(reacquireTau(cfg.activeMs + 1, cfg)).toBe(cfg.reacquireTauMs)
    expect(reacquireTau(60000, cfg)).toBe(cfg.reacquireTauMs)
  })
})
