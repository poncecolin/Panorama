import { AppSettings } from '@shared/types'

interface Props {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
  onClose: () => void
  onOpenCalibration: () => void
  onReset: () => void
}

/** Persistent configuration: physical setup, audio, calibration, reset. */
export function SettingsPanel({
  settings,
  onUpdate,
  onClose,
  onOpenCalibration,
  onReset
}: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="modal-x" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-body">
          <section>
            <h3>Physical setup</h3>
            <p className="settings-hint">
              How big the “glass” is and where the camera sits. The calibration
              wizard fills these in for you.
            </p>
            <Field
              label="Screen width (mm)"
              value={settings.screen.widthMm}
              onChange={(v) =>
                onUpdate({ screen: { ...settings.screen, widthMm: v } })
              }
            />
            <Field
              label="Screen height (mm)"
              value={settings.screen.heightMm}
              onChange={(v) =>
                onUpdate({ screen: { ...settings.screen, heightMm: v } })
              }
            />
            <Field
              label="Pupillary distance (mm)"
              value={settings.viewer.ipdMm}
              onChange={(v) => onUpdate({ viewer: { ipdMm: v } })}
            />
            <Field
              label="Camera field of view (°)"
              value={settings.intrinsics.horizontalFovDeg}
              onChange={(v) =>
                onUpdate({
                  intrinsics: { ...settings.intrinsics, horizontalFovDeg: v }
                })
              }
            />
            <Field
              label="Camera height above screen center (mm)"
              value={settings.placement.position.y}
              onChange={(v) =>
                onUpdate({
                  placement: {
                    ...settings.placement,
                    position: { ...settings.placement.position, y: v }
                  }
                })
              }
            />
            <button className="settings-btn primary" onClick={onOpenCalibration}>
              Run calibration wizard…
            </button>
            <span className="settings-status">
              {settings.calibrated ? '✓ calibrated' : 'using defaults (not calibrated)'}
            </span>
          </section>

          <section>
            <h3>Audio</h3>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.audioEnabled}
                onChange={(e) => onUpdate({ audioEnabled: e.target.checked })}
              />
              Ambient sound
            </label>
            <label className="settings-range">
              Volume
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.audioVolume}
                onChange={(e) => onUpdate({ audioVolume: Number(e.target.value) })}
              />
            </label>
          </section>

          <section>
            <h3>Reset</h3>
            <button className="settings-btn danger" onClick={onReset}>
              Reset all settings to defaults
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 10) / 10}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
