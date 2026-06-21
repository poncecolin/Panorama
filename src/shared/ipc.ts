/**
 * IPC contract between the Electron main process and the renderer.
 * Channel names live here so both sides stay in sync.
 */
import type { AppSettings, DisplayInfo, SettingsPatch } from './types'

export const IPC = {
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  resetSettings: 'settings:reset',
  getDisplayInfo: 'display:get',
  toggleFullscreen: 'window:toggle-fullscreen',
  quit: 'app:quit'
} as const

/** The API surface exposed to the renderer via contextBridge (window.panorama). */
export interface PanoramaApi {
  getSettings(): Promise<AppSettings>
  /** Partial update; returns the merged, persisted settings. */
  setSettings(patch: SettingsPatch): Promise<AppSettings>
  resetSettings(): Promise<AppSettings>
  getDisplayInfo(): Promise<DisplayInfo>
  toggleFullscreen(): Promise<boolean>
  quit(): void
}

declare global {
  interface Window {
    panorama: PanoramaApi
  }
}
