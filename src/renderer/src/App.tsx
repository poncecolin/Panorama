import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings, hasBridge } from './state/useSettings'
import { ControlBar } from './ui/ControlBar'
import { WindowSurface } from './engine/WindowSurface'
import { EngineStatus, PanoramaEngine } from './engine/PanoramaEngine'
import { DevPanel } from './dev/DevPanel'
import { CalibrationWizard } from './settings/CalibrationWizard'
import { SettingsPanel } from './settings/SettingsPanel'
import { SCENES } from '@scenes/registry'

const BAR_AUTOHIDE_MS = 2600

export default function App() {
  const { settings, update, reset } = useSettings()
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [modal, setModal] = useState<'calibration' | 'settings' | null>(null)
  const [devMode, setDevMode] = useState(false)
  const [barVisible, setBarVisible] = useState(false)
  const [showHint, setShowHint] = useState(true)
  const hideTimer = useRef<number | null>(null)
  const engineRef = useRef<PanoramaEngine | null>(null)

  const revealBar = useCallback(() => {
    setBarVisible(true)
    setShowHint(false)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(
      () => setBarVisible(false),
      BAR_AUTOHIDE_MS
    )
  }, [])

  // Hide the first-run hint after a few seconds.
  useEffect(() => {
    const t = window.setTimeout(() => setShowHint(false), 5000)
    return () => window.clearTimeout(t)
  }, [])

  // Global hotkeys.
  useEffect(() => {
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
  }, [revealBar])

  if (!settings) return null

  return (
    <>
      {/* The "window" surface — head-tracked off-axis 3D scene. */}
      <div className="window-surface">
        <WindowSurface
          settings={settings}
          onStatus={setStatus}
          onEngine={(e) => (engineRef.current = e)}
        />
      </div>

      {status?.cameraError && (
        <div className="camera-note">
          Camera unavailable ({status.cameraError}). Showing attract mode — connect a
          camera and reopen to enable head tracking.
        </div>
      )}

      {/* Bottom edge hot-zone reveals the control bar on hover. */}
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
        onOpenCalibration={() => setModal('calibration')}
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

      {modal === 'settings' && (
        <SettingsPanel
          settings={settings}
          onUpdate={update}
          onClose={() => setModal(null)}
          onOpenCalibration={() => setModal('calibration')}
          onReset={() => {
            reset()
            setModal(null)
          }}
        />
      )}
    </>
  )
}
