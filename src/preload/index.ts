import { contextBridge, ipcRenderer } from 'electron'
import { IPC, PanoramaApi } from '../shared/ipc'
import { AppSettings } from '../shared/types'

const api: PanoramaApi = {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke(IPC.setSettings, patch),
  resetSettings: () => ipcRenderer.invoke(IPC.resetSettings),
  getDisplayInfo: () => ipcRenderer.invoke(IPC.getDisplayInfo),
  toggleFullscreen: () => ipcRenderer.invoke(IPC.toggleFullscreen),
  quit: () => ipcRenderer.send(IPC.quit)
}

contextBridge.exposeInMainWorld('panorama', api)
