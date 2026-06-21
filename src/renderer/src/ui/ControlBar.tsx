import { AppSettings } from '@shared/types'
import { hasBridge } from '../state/useSettings'

interface SceneOption {
  id: string
  label: string
}

interface Props {
  visible: boolean
  settings: AppSettings
  scenes: SceneOption[]
  devMode: boolean
  onToggleDev: () => void
  onSelectScene: (id: string) => void
  onOpenSettings: () => void
  onOpenCalibration: () => void
  onUpdate: (patch: Partial<AppSettings>) => void
}

export function ControlBar(props: Props) {
  const {
    visible,
    settings,
    scenes,
    devMode,
    onToggleDev,
    onSelectScene,
    onOpenSettings,
    onOpenCalibration,
    onUpdate
  } = props

  return (
    <div className={`control-bar ${visible ? 'visible' : ''}`} role="toolbar">
      <select
        value={settings.activeSceneId}
        onChange={(e) => onSelectScene(e.target.value)}
        title="Scene"
      >
        {scenes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      <span className="sep" />

      <button
        className={settings.audioEnabled ? 'active' : ''}
        onClick={() => onUpdate({ audioEnabled: !settings.audioEnabled })}
        title="Toggle ambient audio"
      >
        {settings.audioEnabled ? '🔊' : '🔇'}
      </button>
      <input
        className="vol"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={settings.audioVolume}
        onChange={(e) => onUpdate({ audioVolume: Number(e.target.value) })}
        title="Volume"
      />

      <span className="sep" />

      <button onClick={onOpenCalibration} title="Calibration wizard">
        Calibrate
      </button>
      <button onClick={onOpenSettings} title="Settings">
        Settings
      </button>
      <button
        className={devMode ? 'active' : ''}
        onClick={onToggleDev}
        title="Developer mode (D)"
      >
        Dev
      </button>

      {hasBridge && (
        <>
          <span className="sep" />
          <button
            onClick={() => window.panorama.toggleFullscreen()}
            title="Toggle fullscreen (F11)"
          >
            ⛶
          </button>
          <button onClick={() => window.panorama.quit()} title="Quit (Ctrl+Q)">
            ✕
          </button>
        </>
      )}
    </div>
  )
}
