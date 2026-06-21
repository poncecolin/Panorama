import {
  AppSettings,
  CalibrationProfile,
  DEFAULTS,
  DEFAULT_TUNING,
  DisplayInfo,
  SettingsPatch
} from './types'
import { screenMmFromDiagonal } from './calibration'

/**
 * The built-in laptop setup: webcam centered just above the top edge, screen
 * size from the OS if known, else a sensible default. This is the Phase-1 model.
 */
function laptopProfile(display?: DisplayInfo | null): CalibrationProfile {
  const widthMm = display?.physicalWidthMm ?? DEFAULTS.screenWidthMm
  const heightMm = display?.physicalHeightMm ?? DEFAULTS.screenHeightMm
  return {
    placement: {
      position: { x: 0, y: heightMm / 2 + DEFAULTS.cameraAboveTopEdgeMm, z: 0 },
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0
    },
    screen: { widthMm, heightMm }
  }
}

/**
 * A fresh TV setup (Phase 2), seeded from the constrained-placement assumption:
 * laptop centered with the TV and facing the same way (x/yaw/roll = 0), sitting
 * below and slightly forward of the screen. The wizard refines y/z/pitch + size.
 */
function tvProfile(): CalibrationProfile {
  const screen = screenMmFromDiagonal(
    DEFAULTS.tvDiagonalInches,
    DEFAULTS.tvAspectW,
    DEFAULTS.tvAspectH
  )
  return {
    placement: {
      position: { x: 0, y: -DEFAULTS.tvCameraBelowCenterMm, z: DEFAULTS.tvCameraForwardMm },
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0
    },
    screen,
    displayId: null
  }
}

/**
 * Build a complete, working AppSettings using smart defaults. If DisplayInfo with
 * a physical size is provided, the laptop profile's screen/placement derive from it.
 */
export function makeDefaultSettings(display?: DisplayInfo | null): AppSettings {
  return {
    intrinsics: {
      horizontalFovDeg: DEFAULTS.horizontalFovDeg,
      frameWidth: 640,
      frameHeight: 480
    },
    viewer: { ipdMm: DEFAULTS.ipdMm },
    tuning: { ...DEFAULT_TUNING },
    profiles: {
      laptop: laptopProfile(display),
      tv: tvProfile()
    },
    activeProfile: 'laptop',
    activeSceneId: 'landscape',
    audioEnabled: false,
    audioVolume: 0.4,
    calibrated: false
  }
}

/** The calibration profile the engine should currently render through. */
export function activeCalibration(s: AppSettings): CalibrationProfile {
  return s.profiles[s.activeProfile]
}

/** One-level merge of a profile patch onto a base profile. */
function mergeProfile(
  base: CalibrationProfile,
  patch?: Partial<CalibrationProfile>
): CalibrationProfile {
  if (!patch) return base
  return {
    placement: { ...base.placement, ...patch.placement },
    screen: { ...base.screen, ...patch.screen },
    displayId: patch.displayId !== undefined ? patch.displayId : base.displayId
  }
}

/** Deep-ish merge of a settings patch onto a base (one level into nested objects). */
export function mergeSettings(base: AppSettings, patch: SettingsPatch): AppSettings {
  // Back-compat: a Phase-1 store kept placement/screen at the top level. Fold
  // them into the laptop profile so old saves keep working after the refactor.
  const { placement: legacyPlacement, screen: legacyScreen, ...rest } = patch
  let patchProfiles = patch.profiles
  if (!patchProfiles && (legacyPlacement || legacyScreen)) {
    patchProfiles = { laptop: { placement: legacyPlacement, screen: legacyScreen } }
  }

  return {
    ...base,
    ...rest,
    intrinsics: { ...base.intrinsics, ...patch.intrinsics },
    viewer: { ...base.viewer, ...patch.viewer },
    tuning: { ...base.tuning, ...patch.tuning },
    profiles: {
      laptop: mergeProfile(base.profiles.laptop, patchProfiles?.laptop),
      tv: mergeProfile(base.profiles.tv, patchProfiles?.tv)
    },
    activeProfile: patch.activeProfile ?? base.activeProfile
  }
}
