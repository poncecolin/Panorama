import {
  AppSettings,
  DEFAULTS,
  DEFAULT_TUNING,
  DisplayInfo
} from './types'

/**
 * Build a complete, working AppSettings using smart defaults. If DisplayInfo with
 * a physical size is provided, derive the screen geometry and the camera placement
 * (laptop webcam just above the top edge) from it.
 */
export function makeDefaultSettings(display?: DisplayInfo | null): AppSettings {
  const widthMm = display?.physicalWidthMm ?? DEFAULTS.screenWidthMm
  const heightMm = display?.physicalHeightMm ?? DEFAULTS.screenHeightMm

  return {
    intrinsics: {
      horizontalFovDeg: DEFAULTS.horizontalFovDeg,
      frameWidth: 640,
      frameHeight: 480
    },
    placement: {
      // Webcam centered horizontally, just above the top edge, looking at viewer.
      position: { x: 0, y: heightMm / 2 + DEFAULTS.cameraAboveTopEdgeMm, z: 0 },
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0
    },
    screen: { widthMm, heightMm },
    viewer: { ipdMm: DEFAULTS.ipdMm },
    tuning: { ...DEFAULT_TUNING },
    activeSceneId: 'landscape',
    audioEnabled: false,
    audioVolume: 0.4,
    calibrated: false
  }
}

/** Deep-ish merge of a settings patch onto a base (one level into nested objects). */
export function mergeSettings(
  base: AppSettings,
  patch: Partial<AppSettings>
): AppSettings {
  return {
    ...base,
    ...patch,
    intrinsics: { ...base.intrinsics, ...patch.intrinsics },
    placement: { ...base.placement, ...patch.placement },
    screen: { ...base.screen, ...patch.screen },
    viewer: { ...base.viewer, ...patch.viewer },
    tuning: { ...base.tuning, ...patch.tuning }
  }
}
