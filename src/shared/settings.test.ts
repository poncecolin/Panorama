import { describe, it, expect } from 'vitest'
import { makeDefaultSettings, mergeSettings, activeCalibration } from './settings'
import { AppSettings, DEFAULTS, SettingsPatch } from './types'

describe('makeDefaultSettings', () => {
  it('ships both profiles with laptop active', () => {
    const s = makeDefaultSettings()
    expect(s.activeProfile).toBe('laptop')
    expect(s.profiles.laptop).toBeDefined()
    expect(s.profiles.tv).toBeDefined()
  })

  it('laptop profile places the camera just above the top edge', () => {
    const s = makeDefaultSettings()
    const { screen, placement } = s.profiles.laptop
    expect(placement.position.x).toBe(0)
    expect(placement.position.z).toBe(0)
    expect(placement.position.y).toBeCloseTo(
      screen.heightMm / 2 + DEFAULTS.cameraAboveTopEdgeMm,
      6
    )
  })

  it('derives laptop screen from OS physical size when provided', () => {
    const s = makeDefaultSettings({
      physicalWidthMm: 600,
      physicalHeightMm: 340,
      width: 1920,
      height: 1080,
      scaleFactor: 1
    })
    expect(s.profiles.laptop.screen).toEqual({ widthMm: 600, heightMm: 340 })
  })

  it('seeds a plausible TV profile (large, landscape, below center, forward)', () => {
    const tv = makeDefaultSettings().profiles.tv
    expect(tv.screen.widthMm).toBeGreaterThan(1000)
    expect(tv.screen.widthMm).toBeGreaterThan(tv.screen.heightMm)
    expect(tv.placement.position.y).toBeLessThan(0) // camera below TV center
    expect(tv.placement.position.z).toBeGreaterThan(0) // forward of the screen plane
  })
})

describe('mergeSettings — legacy migration', () => {
  it('folds Phase-1 top-level placement/screen into profiles.laptop', () => {
    const base = makeDefaultSettings()
    // A pre-profiles store blob.
    const legacy = {
      placement: {
        position: { x: 0, y: 91, z: 0 },
        yawDeg: 0,
        pitchDeg: 0,
        rollDeg: 0
      },
      screen: { widthMm: 309, heightMm: 174 },
      viewer: { ipdMm: 64 }
    } as unknown as SettingsPatch

    const merged = mergeSettings(base, legacy)
    expect(merged.profiles.laptop.screen).toEqual({ widthMm: 309, heightMm: 174 })
    expect(merged.profiles.laptop.placement.position.y).toBe(91)
    expect(merged.viewer.ipdMm).toBe(64)
    // The legacy top-level keys must not survive onto the merged settings.
    expect('placement' in merged).toBe(false)
    expect('screen' in merged).toBe(false)
  })
})

describe('mergeSettings — partial profile patches', () => {
  it('patches one profile field without clobbering its siblings', () => {
    const base = makeDefaultSettings()
    const tvScreenBefore = base.profiles.tv.screen
    const merged = mergeSettings(base, {
      profiles: { tv: { placement: { ...base.profiles.tv.placement, pitchDeg: -8 } } }
    })
    expect(merged.profiles.tv.placement.pitchDeg).toBe(-8)
    expect(merged.profiles.tv.screen).toEqual(tvScreenBefore) // untouched
    expect(merged.profiles.laptop).toEqual(base.profiles.laptop) // untouched
  })

  it('switches the active profile', () => {
    const base = makeDefaultSettings()
    const merged = mergeSettings(base, { activeProfile: 'tv' })
    expect(merged.activeProfile).toBe('tv')
    expect(activeCalibration(merged)).toEqual(base.profiles.tv)
  })
})

describe('activeCalibration', () => {
  it('returns the profile named by activeProfile', () => {
    const s: AppSettings = { ...makeDefaultSettings(), activeProfile: 'tv' }
    expect(activeCalibration(s)).toBe(s.profiles.tv)
  })
})
