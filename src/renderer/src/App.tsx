import { useCallback, useEffect, useRef, useState } from 'react'
import { CalibrationSceneState } from '@shared/types'
import { useSettings, hasBridge } from './state/useSettings'
import { ControlBar } from './ui/ControlBar'
import { WindowSurface } from './engine/WindowSurface'
import { EngineStatus, PanoramaEngine } from './engine/PanoramaEngine'
import { fromStatusMsg, toStatusMsg } from './engine/statusMsg'
import { DevPanel } from './dev/DevPanel'
import { CalibrationWizard } from './settings/CalibrationWizard'
import { TvCalibrationWizard } from './settings/TvCalibrationWizard'
import { SettingsPanel } from './settings/SettingsPanel'
import { SCENES } from '@scenes/registry'

const BAR_AUTOHIDE_MS = 2600

type Modal = 'calibration' | 'tvCalibration' | 'settings' | null

/**
 * The renderer is loaded into up to three surfaces (see shared/types `Surface`):
 *  - `solo`    — laptop mode, one window: engine + control overlays (Phase 1).
 *  - `scene`   — TV mode, the fullscreen window on the TV: engine only; streams
 *                status to the control window and obeys its calibration commands.
 *  - `control` — TV mode, the laptop window: control overlays + wizard, driven by
 *                the streamed status (no local engine/camera).
 * `surface="scene"` is forced by the URL; otherwise solo vs control is derived
 * from the active profile.
 */
export default function App({ surface = 'auto' }: { surface?: 'auto' | 'scene' }) {
  const { settings, update, reset } = useSettings()
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [devMode, setDevMode] = useState(false)
  const [barVisible, setBarVisible] = useState(false)
  const [showHint, setShowHint] = useState(true)
  const [calib, setCalib] = useState<CalibrationSceneState | null>(null)
  const hideTimer = useRef<number | null>(null)
  const engineRef = useRef<PanoramaEngine | null>(null)

  const isScene = surface === 'scene'
  const isControl = !isScene && settings?.activeProfile === 'tv'
  const isSolo = !isScene && !isControl

  const revealBar = useCallback(() => {
    setBarVisible(true)
    setShowHint(false)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setBarVisible(false), BAR_AUTOHIDE_MS)
  }, [])

  // Hide the first-run hint after a few seconds.
  useEffect(() => {
    const t = window.setTimeout(() => setShowHint(false), 5000)
    return () => window.clearTimeout(t)
  }, [])

  // Scene window: receive calibration commands from the control window.
  useEffect(() => {
    if (!isScene || !hasBridge) return
    return window.panorama.onSceneCommand((cmd) => {
      if (cmd.type === 'calibration') setCalib(cmd.state)
      else setCalib(null)
    })
  }, [isScene])

  // Control window: drive overlays from the streamed engine status.
  useEffect(() => {
    if (!isControl || !hasBridge) return
    return window.panorama.onEngineStatus((m) => setStatus(fromStatusMsg(m)))
  }, [isControl])

  // Global hotkeys (not on the scene window, which has no controls).
  useEffect(() => {
    if (isScene) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D' || e.key === '`') {
        setDevMode((d) => !d)
        revealBar()
      } else if (e.key === 'F11') {
        e.preventDefault()
        if (hasBridge) window.panorama.toggleFullscreen()
      } else if (e.key === 'Escape') {
        setBarVisible(false)
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q')) {
        if (hasBridge) window.panorama.quit()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        revealBar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealBar, isScene])

  if (!settings) return null

  // ── Scene surface (TV): just the head-tracked window, plus status forwarding. ──
  if (isScene) {
    return (
      <div className="window-surface">
        <WindowSurface
          settings={settings}
          sceneIdOverride={calib ? 'calib' : undefined}
          calibrationState={calib}
          onStatus={(s) => {
            if (hasBridge) window.panorama.sendEngineStatus(toStatusMsg(s))
          }}
          onEngine={(e) => (engineRef.current = e)}
        />
      </div>
    )
  }

  // ── Solo + control surfaces share the overlay UI. ──
  const enterTvSetup = () => {
    setModal('tvCalibration')
    revealBar()
  }
  const exitTv = async () => {
    if (hasBridge) await window.panorama.setMode('laptop')
    else update({ activeProfile: 'laptop' })
  }

  return (
    <>
      {/* Solo mode renders the live window here; control mode shows a placeholder. */}
      {isSolo ? (
        <div className="window-surface">
          <WindowSurface
            settings={settings}
            onStatus={setStatus}
            onEngine={(e) => (engineRef.current = e)}
          />
        </div>
      ) : (
        <div className="control-backdrop">
          <p>TV mode — the window is showing on your television.</p>
          <p className="control-backdrop-sub">
            Use the controls below; press D for developer readouts.
          </p>
        </div>
      )}

      {status?.cameraError && isSolo && (
        <div className="camera-note">
          Camera unavailable ({status.cameraError}). Showing attract mode — connect a
          camera and reopen to enable head tracking.
        </div>
      )}

      <div className="edge-hot-zone" onMouseEnter={revealBar} />
      <div className={`bar-hint ${showHint ? 'show' : ''}`}>
        move to the bottom edge or press Tab for controls · D for developer mode
      </div>

      <ControlBar
        visible={barVisible}
        settings={settings}
        scenes={SCENES}
        devMode={devMode}
        onToggleDev={() => setDevMode((d) => !d)}
        onSelectScene={(id) => update({ activeSceneId: id })}
        onOpenSettings={() => setModal('settings')}
        onOpenCalibration={() => setModal(isControl ? 'tvCalibration' : 'calibration')}
        onEnterTvSetup={enterTvSetup}
        onExitTv={exitTv}
        onUpdate={update}
      />

      {devMode && (
        <DevPanel
          status={status}
          settings={settings}
          onUpdate={update}
          getVideo={() => engineRef.current?.getVideoElement() ?? null}
        />
      )}

      {modal === 'calibration' && (
        <CalibrationWizard
          settings={settings}
          onUpdate={update}
          onClose={() => setModal(null)}
          getFrame={() => engineRef.current?.getLatestFrame() ?? null}
        />
      )}

      {modal === 'tvCalibration' && (
        <TvCalibrationWizard
          settings={settings}
          status={status}
          onUpdate={update}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'settings' && (
        <SettingsPanel
          settings={settings}
          onUpdate={update}
          onClose={() => setModal(null)}
          onOpenCalibration={() => setModal(isControl ? 'tvCalibration' : 'calibration')}
          onReset={() => {
            reset()
            setModal(null)
          }}
        />
      )}
    </>
  )
}
