/**
 * IPC contract between the Electron main process and the renderer.
 * Channel names live here so both sides stay in sync.
 */
import type {
  AppSettings,
  DisplayDescriptor,
  DisplayInfo,
  EngineStatusMsg,
  ProfileKey,
  SceneCommand,
  SettingsPatch
} from './types'

export const IPC = {
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  resetSettings: 'settings:reset',
  /** Broadcast (main → all renderers) whenever settings change, so windows sync. */
  settingsChanged: 'settings:changed',
  getDisplayInfo: 'display:get',
  /** List connected displays for the TV-mode picker. */
  listDisplays: 'display:list',
  /** Switch laptop ⇄ TV mode; opens/closes the scene window. */
  setMode: 'mode:set',
  /** Status stream scene → control (relayed by main). */
  engineStatus: 'engine:status',
  /** Calibration commands control → scene (relayed by main). */
  sceneCommand: 'scene:command',
  toggleFullscreen: 'window:toggle-fullscreen',
  quit: 'app:quit'
} as const

/** The API surface exposed to the renderer via contextBridge (window.panorama). */
export interface PanoramaApi {
  getSettings(): Promise<AppSettings>
  /** Partial update; returns the merged, persisted settings. */
  setSettings(patch: SettingsPatch): Promise<AppSettings>
  resetSettings(): Promise<AppSettings>
  /** Subscribe to settings changes broadcast from main; returns an unsubscribe fn. */
  onSettingsChanged(cb: (settings: AppSettings) => void): () => void
  getDisplayInfo(): Promise<DisplayInfo>
  listDisplays(): Promise<DisplayDescriptor[]>
  /** Switch mode; in TV mode opens the scene window on `tvDisplayId`. Returns settings. */
  setMode(mode: ProfileKey, tvDisplayId?: number): Promise<AppSettings>
  /** Scene window: publish engine status to the control window. */
  sendEngineStatus(status: EngineStatusMsg): void
  /** Control window: receive the engine status stream; returns an unsubscribe fn. */
  onEngineStatus(cb: (status: EngineStatusMsg) => void): () => void
  /** Control window: send a calibration command to the scene window. */
  sendSceneCommand(cmd: SceneCommand): void
  /** Scene window: receive calibration commands; returns an unsubscribe fn. */
  onSceneCommand(cb: (cmd: SceneCommand) => void): () => void
  toggleFullscreen(): Promise<boolean>
  quit(): void
}

declare global {
  interface Window {
    panorama: PanoramaApi
  }
}
