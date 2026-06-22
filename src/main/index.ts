import { app, BrowserWindow, ipcMain, screen, session } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { IPC } from '../shared/ipc'
import {
  AppSettings,
  DisplayDescriptor,
  DisplayInfo,
  EngineStatusMsg,
  ProfileKey,
  SceneCommand,
  SettingsPatch
} from '../shared/types'
import { makeDefaultSettings, mergeSettings } from '../shared/settings'

/** The laptop window: solo (laptop mode) or control surface (TV mode). */
let mainWindow: BrowserWindow | null = null
/** The TV window: exists only in TV mode (fullscreen scene on the external display). */
let sceneWindow: BrowserWindow | null = null
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

function listDisplays(): DisplayDescriptor[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    internal: d.internal,
    primary: d.id === primaryId,
    width: d.size.width,
    height: d.size.height,
    label: `${d.internal ? 'Built-in' : 'External'} · ${d.size.width}×${d.size.height}${
      d.id === primaryId ? ' (primary)' : ''
    }`
  }))
}

function loadSettings(): AppSettings {
  const existing = store.get('settings')
  if (existing) return mergeSettings(makeDefaultSettings(getDisplayInfo()), existing)
  const fresh = makeDefaultSettings(getDisplayInfo())
  store.set('settings', fresh)
  return fresh
}

/** Persist a patch and broadcast the merged result to every window. */
function persistAndBroadcast(patch: SettingsPatch): AppSettings {
  const merged = mergeSettings(loadSettings(), patch)
  store.set('settings', merged)
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(IPC.settingsChanged, merged)
  }
  return merged
}

/** Resolve the renderer URL/file, with an optional surface query for the scene window. */
function loadRenderer(win: BrowserWindow, surface?: 'scene'): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    const base = process.env['ELECTRON_RENDERER_URL']
    win.loadURL(surface ? `${base}?surface=${surface}` : base)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      search: surface ? `surface=${surface}` : undefined
    })
  }
}

function createMainWindow(): void {
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
      nodeIntegration: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  loadRenderer(mainWindow)
}

/** Open the TV scene window fullscreen on the chosen display. */
function openSceneWindow(tvDisplayId?: number): void {
  const target =
    screen.getAllDisplays().find((d) => d.id === tvDisplayId) ??
    screen.getAllDisplays().find((d) => !d.internal) ??
    screen.getPrimaryDisplay()

  if (sceneWindow) {
    sceneWindow.setBounds(target.bounds)
    sceneWindow.setFullScreen(true)
    sceneWindow.focus()
    return
  }

  sceneWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    fullscreen: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  sceneWindow.on('ready-to-show', () => sceneWindow?.show())
  sceneWindow.on('closed', () => {
    sceneWindow = null
  })
  loadRenderer(sceneWindow, 'scene')
}

function closeSceneWindow(): void {
  sceneWindow?.close()
  sceneWindow = null
}

/** Forward a relayed message to every window except the sender. */
function relay(sender: Electron.WebContents, channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.webContents.id !== sender.id) w.webContents.send(channel, payload)
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getSettings, () => loadSettings())

  ipcMain.handle(IPC.setSettings, (_e, patch: SettingsPatch) => persistAndBroadcast(patch))

  ipcMain.handle(IPC.resetSettings, () => {
    const fresh = makeDefaultSettings(getDisplayInfo())
    store.set('settings', fresh)
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(IPC.settingsChanged, fresh)
    }
    closeSceneWindow()
    return fresh
  })

  ipcMain.handle(IPC.getDisplayInfo, () => getDisplayInfo())
  ipcMain.handle(IPC.listDisplays, () => listDisplays())

  ipcMain.handle(IPC.setMode, (_e, mode: ProfileKey, tvDisplayId?: number) => {
    const patch: SettingsPatch = { activeProfile: mode }
    if (mode === 'tv' && tvDisplayId !== undefined) {
      patch.profiles = { tv: { displayId: tvDisplayId } }
    }
    const merged = persistAndBroadcast(patch)
    if (mode === 'tv') openSceneWindow(tvDisplayId ?? merged.profiles.tv.displayId ?? undefined)
    else closeSceneWindow()
    return merged
  })

  // Relays between the control and scene windows.
  ipcMain.on(IPC.engineStatus, (e, status: EngineStatusMsg) =>
    relay(e.sender, IPC.engineStatus, status)
  )
  ipcMain.on(IPC.sceneCommand, (e, cmd: SceneCommand) =>
    relay(e.sender, IPC.sceneCommand, cmd)
  )

  ipcMain.handle(IPC.toggleFullscreen, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    const next = !win.isFullScreen()
    win.setFullScreen(next)
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
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
