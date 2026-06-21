import { app, BrowserWindow, ipcMain, screen, session } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { IPC } from '../shared/ipc'
import { AppSettings, DisplayInfo } from '../shared/types'
import { makeDefaultSettings, mergeSettings } from '../shared/settings'

let mainWindow: BrowserWindow | null = null
// electron-store is typed loosely here to avoid ESM/CJS generic friction.
const store = new Store<{ settings?: AppSettings }>({ name: 'panorama' })

function getDisplayInfo(): DisplayInfo {
  const display = mainWindow
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay()
  const { width, height } = display.size
  return {
    // Electron does not expose true physical size (mm). The calibration wizard
    // fills this in; a future native EDID reader could populate it automatically.
    physicalWidthMm: null,
    physicalHeightMm: null,
    width,
    height,
    scaleFactor: display.scaleFactor
  }
}

function loadSettings(): AppSettings {
  const existing = store.get('settings')
  if (existing) return mergeSettings(makeDefaultSettings(getDisplayInfo()), existing)
  const fresh = makeDefaultSettings(getDisplayInfo())
  store.set('settings', fresh)
  return fresh
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    fullscreen: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      // Camera access happens in the renderer; allow it without a prompt loop.
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Renderer URL is injected by electron-vite in dev; load the built file in prod.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getSettings, () => loadSettings())

  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<AppSettings>) => {
    const merged = mergeSettings(loadSettings(), patch)
    store.set('settings', merged)
    return merged
  })

  ipcMain.handle(IPC.resetSettings, () => {
    const fresh = makeDefaultSettings(getDisplayInfo())
    store.set('settings', fresh)
    return fresh
  })

  ipcMain.handle(IPC.getDisplayInfo, () => getDisplayInfo())

  ipcMain.handle(IPC.toggleFullscreen, () => {
    if (!mainWindow) return false
    const next = !mainWindow.isFullScreen()
    mainWindow.setFullScreen(next)
    return next
  })

  ipcMain.on(IPC.quit, () => app.quit())
}

// Auto-grant camera permission for our own renderer (all processing is local).
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
