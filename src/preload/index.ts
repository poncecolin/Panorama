import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IPC, PanoramaApi } from '../shared/ipc'
import {
  AppSettings,
  EngineStatusMsg,
  ProfileKey,
  SceneCommand,
  SettingsPatch
} from '../shared/types'

/** Wrap an ipcRenderer.on subscription so callers get a tidy unsubscribe fn. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: PanoramaApi = {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch: SettingsPatch) => ipcRenderer.invoke(IPC.setSettings, patch),
  resetSettings: () => ipcRenderer.invoke(IPC.resetSettings),
  onSettingsChanged: (cb: (settings: AppSettings) => void) =>
    subscribe(IPC.settingsChanged, cb),
  getDisplayInfo: () => ipcRenderer.invoke(IPC.getDisplayInfo),
  listDisplays: () => ipcRenderer.invoke(IPC.listDisplays),
  setMode: (mode: ProfileKey, tvDisplayId?: number) =>
    ipcRenderer.invoke(IPC.setMode, mode, tvDisplayId),
  sendEngineStatus: (status: EngineStatusMsg) => ipcRenderer.send(IPC.engineStatus, status),
  onEngineStatus: (cb: (status: EngineStatusMsg) => void) =>
    subscribe(IPC.engineStatus, cb),
  sendSceneCommand: (cmd: SceneCommand) => ipcRenderer.send(IPC.sceneCommand, cmd),
  onSceneCommand: (cb: (cmd: SceneCommand) => void) => subscribe(IPC.sceneCommand, cb),
  toggleFullscreen: () => ipcRenderer.invoke(IPC.toggleFullscreen),
  quit: () => ipcRenderer.send(IPC.quit)
}

contextBridge.exposeInMainWorld('panorama', api)
