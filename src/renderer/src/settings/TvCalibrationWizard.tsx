import { useEffect, useRef, useState } from 'react'
import {
  AppSettings,
  DisplayDescriptor,
  SettingsPatch,
  Vec3,
  ViewerSample
} from '@shared/types'
import { screenMmFromDiagonal } from '@shared/calibration'
import { cameraFrameEye } from '@core/geometry/cameraModel'
import { solvePitchFromCenteredCaptures } from '@core/geometry/tvCalibration'
import { EngineStatus } from '../engine/PanoramaEngine'
import { hasBridge } from '../state/useSettings'

interface Props {
  settings: AppSettings
  status: EngineStatus | null
  onUpdate: (patch: SettingsPatch) => void
  onClose: () => void
}

const STEP_TITLES = ['Display', 'TV size', 'Camera position', 'Camera tilt', 'Fine-tune']

/** Millimetres per inch — the wizard talks to the user in inches, stores mm. */
const IN_MM = 25.4

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/**
 * TV calibration: measure what's easy (TV size + where the camera sits, in inches),
 * then solve the one thing that's hard to eyeball — the camera's upward tilt — from
 * a couple of "stand near / step back" captures (see solvePitchFromCenteredCaptures).
 * A final fine-tune nudges any residual while the TV updates live.
 */
export function TvCalibrationWizard({ settings, status, onUpdate, onClose }: Props) {
  const tv = settings.profiles.tv
  const tvActive = settings.activeProfile === 'tv'

  const [step, setStep] = useState(tvActive ? 1 : 0)
  const [displays, setDisplays] = useState<DisplayDescriptor[]>([])
  const [displayId, setDisplayId] = useState<number | null>(tv.displayId ?? null)
  const [diagonalIn, setDiagonalIn] = useState('55')
  const [dropIn, setDropIn] = useState(24)
  const [forwardIn, setForwardIn] = useState(8)
  const [tiltCaptures, setTiltCaptures] = useState<Vec3[]>([])
  const [capturing, setCapturing] = useState(false)
  const [captureMsg, setCaptureMsg] = useState('')
  const [solvedPitch, setSolvedPitch] = useState<number | null>(null)

  // Keep the latest streamed status for the capture sampler.
  const statusRef = useRef<EngineStatus | null>(status)
  statusRef.current = status

  // Load the display list for the picker.
  useEffect(() => {
    if (!hasBridge) return
    window.panorama.listDisplays().then((ds) => {
      setDisplays(ds)
      if (displayId === null) {
        const ext = ds.find((d) => !d.internal) ?? ds.find((d) => !d.primary)
        if (ext) setDisplayId(ext.id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show the symmetry grid (no edge markers) on the TV for orientation throughout.
  useEffect(() => {
    if (!hasBridge || !tvActive) return
    window.panorama.sendSceneCommand({
      type: 'calibration',
      state: { showGrid: true, markers: [] }
    })
  }, [step, tvActive])

  const startTvMode = async () => {
    if (!hasBridge || displayId === null) return
    await window.panorama.setMode('tv', displayId)
    setStep(1)
  }

  const saveSize = () => {
    const screen = screenMmFromDiagonal(Number(diagonalIn) || 55, 16, 9)
    onUpdate({ profiles: { tv: { screen } } })
  }

  const saveMeasured = () => {
    onUpdate({
      profiles: {
        tv: {
          placement: {
            ...tv.placement,
            position: { x: 0, y: -dropIn * IN_MM, z: forwardIn * IN_MM }
          }
        }
      }
    })
  }

  /** Sample the streamed face over ~1.2 s and record the camera-frame eye. */
  const captureTilt = () => {
    setCapturing(true)
    setCaptureMsg('Hold still…')
    const eyeX: number[] = []
    const eyeY: number[] = []
    const inter: number[] = []
    const yaw: number[] = []
    const t0 = performance.now()
    const id = window.setInterval(() => {
      const s = statusRef.current?.frame?.sample
      if (s && s.confidence > 0.4) {
        eyeX.push(s.eyeCenter.x)
        eyeY.push(s.eyeCenter.y)
        inter.push(s.interEyeNorm)
        yaw.push(s.yawDeg ?? 0)
      }
      if (performance.now() - t0 > 1200) {
        window.clearInterval(id)
        setCapturing(false)
        if (inter.length < 4) {
          setCaptureMsg('No steady face detected — step into view and try again.')
          return
        }
        const sample: Pick<ViewerSample, 'eyeCenter' | 'interEyeNorm' | 'yawDeg'> = {
          eyeCenter: { x: median(eyeX), y: median(eyeY) },
          interEyeNorm: median(inter),
          yawDeg: median(yaw)
        }
        const camEye = cameraFrameEye(sample, settings.intrinsics, settings.viewer, {
          parallaxGain: 1,
          yawCosFloor: settings.tuning.yawCosFloor
        })
        setTiltCaptures((prev) => [...prev, camEye])
        setCaptureMsg('Captured. Move to a different distance and capture again.')
      }
    }, 60)
  }

  const solveTilt = () => {
    const pitch = solvePitchFromCenteredCaptures(tiltCaptures)
    setSolvedPitch(pitch)
    onUpdate({ profiles: { tv: { placement: { ...tv.placement, pitchDeg: pitch } } } })
    setStep(4)
  }

  const setPlacement = (patch: Partial<{ y: number; z: number; pitch: number }>) => {
    onUpdate({
      profiles: {
        tv: {
          placement: {
            ...tv.placement,
            pitchDeg: patch.pitch ?? tv.placement.pitchDeg,
            position: {
              ...tv.placement.position,
              y: patch.y ?? tv.placement.position.y,
              z: patch.z ?? tv.placement.position.z
            }
          }
        }
      }
    })
  }

  const finish = () => {
    onUpdate({ calibrated: true })
    if (hasBridge) window.panorama.sendSceneCommand({ type: 'exitCalibration' })
    onClose()
  }

  const cancel = () => {
    if (hasBridge && tvActive) window.panorama.sendSceneCommand({ type: 'exitCalibration' })
    onClose()
  }

  const screenPreview = screenMmFromDiagonal(Number(diagonalIn) || 55, 16, 9)
  const tracking = !!status?.frame?.sample

  return (
    <div className="modal-overlay" onClick={cancel}>
      <div className="modal wizard" onClick={(e) => e.stopPropagation()}>
        <div className="wizard-steps">
          {STEP_TITLES.map((t, i) => (
            <span
              key={t}
              className={`wizard-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="wizard-body">
          {step === 0 && (
            <>
              <h2>Set up TV mode</h2>
              <p>
                Place the laptop <b>centered below (or above) the TV</b>, facing the same
                way as the screen, and connect the TV over HDMI as an <i>extended</i>
                display. Pick the TV below, then start.
              </p>
              {!hasBridge && <p className="wizard-readout">TV mode requires the desktop app.</p>}
              <label className="wizard-field">
                Television display
                <select
                  value={displayId ?? ''}
                  onChange={(e) => setDisplayId(Number(e.target.value))}
                >
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {step === 1 && (
            <>
              <h2>How big is the TV?</h2>
              <p>
                Enter the <b>diagonal size</b> the TV is sold by (inches). We assume a 16:9
                screen.
              </p>
              <label className="wizard-field">
                Diagonal size (inches)
                <input
                  type="number"
                  value={diagonalIn}
                  onChange={(e) => setDiagonalIn(e.target.value)}
                  step="1"
                  min="20"
                />
              </label>
              <p className="wizard-readout">
                → {(screenPreview.widthMm / IN_MM).toFixed(1)} in wide ×{' '}
                {(screenPreview.heightMm / IN_MM).toFixed(1)} in tall
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <h2>Where is the camera?</h2>
              <p>
                Measure with a tape — this is the part that has to be right. How far the
                laptop camera sits <b>below the center of the TV</b>, and how far it stands{' '}
                <b>in front</b> of the screen face.
              </p>
              <label className="wizard-field">
                Camera below TV center (inches)
                <input
                  type="number"
                  value={dropIn}
                  onChange={(e) => setDropIn(Number(e.target.value))}
                  step="0.5"
                />
              </label>
              <label className="wizard-field">
                Camera in front of screen (inches)
                <input
                  type="number"
                  value={forwardIn}
                  onChange={(e) => setForwardIn(Number(e.target.value))}
                  step="0.5"
                />
              </label>
              <p className="wizard-hint">
                (If the camera sits above the TV center, enter a negative "below" value.)
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <h2>Camera tilt</h2>
              <p className="wizard-bigprompt">
                Stand in front of the TV at a comfortable distance and press Capture. Then{' '}
                <b>step toward or away</b> from the TV and capture again. Two or three
                distances is plenty — keep your head at the same height each time.
              </p>
              <button className="wizard-capture" onClick={captureTilt} disabled={capturing}>
                {capturing ? 'Capturing…' : `Capture (${tiltCaptures.length})`}
              </button>
              {captureMsg && <p className="wizard-readout">{captureMsg}</p>}
              <p className="wizard-hint">
                Tracking: {tracking ? 'face locked' : 'no face — step into view'}
                {tiltCaptures.length > 0 && ` · ${tiltCaptures.length} captured`}
              </p>
            </>
          )}

          {step === 4 && (
            <>
              <h2>Fine-tune</h2>
              <p>
                {solvedPitch !== null
                  ? `Camera tilt solved: ${solvedPitch.toFixed(1)}°. `
                  : ''}
                Nudge any axis if the window still looks off — the TV updates live.
              </p>
              <Slider
                label="Camera below/above TV center (inches)"
                min={-36}
                max={36}
                step={0.5}
                value={-tv.placement.position.y / IN_MM}
                onChange={(v) => setPlacement({ y: -v * IN_MM })}
              />
              <Slider
                label="Camera in front of screen (inches)"
                min={-8}
                max={48}
                step={0.5}
                value={tv.placement.position.z / IN_MM}
                onChange={(v) => setPlacement({ z: v * IN_MM })}
              />
              <Slider
                label="Camera tilt / pitch (°)"
                min={-30}
                max={30}
                step={0.5}
                value={tv.placement.pitchDeg}
                onChange={(v) => setPlacement({ pitch: v })}
              />
            </>
          )}
        </div>

        <div className="wizard-nav">
          <button className="wizard-skip" onClick={cancel}>
            Cancel
          </button>
          <div className="wizard-nav-right">
            {step > (tvActive ? 1 : 0) && step !== 3 && (
              <button onClick={() => setStep((s) => s - 1)} disabled={capturing}>
                Back
              </button>
            )}
            {step === 3 && (
              <button onClick={() => setTiltCaptures([])} disabled={capturing}>
                Clear
              </button>
            )}
            {step === 0 && (
              <button
                className="primary"
                onClick={startTvMode}
                disabled={!hasBridge || displayId === null}
              >
                Start TV mode
              </button>
            )}
            {step === 1 && (
              <button
                className="primary"
                onClick={() => {
                  saveSize()
                  setStep(2)
                }}
              >
                Next
              </button>
            )}
            {step === 2 && (
              <button
                className="primary"
                onClick={() => {
                  saveMeasured()
                  setTiltCaptures([])
                  setSolvedPitch(null)
                  setStep(3)
                }}
              >
                Next
              </button>
            )}
            {step === 3 && (
              <button
                className="primary"
                onClick={solveTilt}
                disabled={capturing || tiltCaptures.length < 2}
              >
                Solve tilt
              </button>
            )}
            {step === 4 && (
              <button className="primary" onClick={finish}>
                Save &amp; finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
  step = 1
}: {
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label className="wizard-field">
      {label}: {value.toFixed(1)}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
