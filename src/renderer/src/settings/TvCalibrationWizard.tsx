import { useEffect, useRef, useState } from 'react'
import {
  AppSettings,
  DisplayDescriptor,
  ProbeMarker,
  ScreenEdge,
  SettingsPatch,
  Vec3,
  ViewerSample
} from '@shared/types'
import { screenMmFromDiagonal } from '@shared/calibration'
import { cameraFrameEye } from '@core/geometry/cameraModel'
import { ProbeObservation, grazingMarker, solvePlacement } from '@core/geometry/tvCalibration'
import { EngineStatus } from '../engine/PanoramaEngine'
import { hasBridge } from '../state/useSettings'

interface Props {
  settings: AppSettings
  status: EngineStatus | null
  onUpdate: (patch: SettingsPatch) => void
  onClose: () => void
}

const STEP_TITLES = ['Display', 'TV size', 'Rough placement', 'Look around', 'Fine-tune']

/** The probe sequence. Two depths on top/bottom separate pitch from vertical offset. */
const PROBES: { edge: ScreenEdge; depthMm: number; color: number; label: string }[] = [
  { edge: 'right', depthMm: -700, color: 0xff3b3b, label: 'red' },
  { edge: 'left', depthMm: -700, color: 0x3bff7a, label: 'green' },
  { edge: 'top', depthMm: -500, color: 0x4fa8ff, label: 'blue' },
  { edge: 'bottom', depthMm: -500, color: 0xffd23b, label: 'yellow' },
  { edge: 'top', depthMm: -1600, color: 0x4fa8ff, label: 'blue' },
  { edge: 'bottom', depthMm: -1600, color: 0xffd23b, label: 'yellow' }
]

/** Nominal viewer eye (screen frame) the probe markers are laid out for. */
const NOMINAL_EYE: Vec3 = { x: 0, y: 0, z: 1500 }

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function TvCalibrationWizard({ settings, status, onUpdate, onClose }: Props) {
  const tv = settings.profiles.tv
  const tvActive = settings.activeProfile === 'tv'

  const [step, setStep] = useState(tvActive ? 1 : 0)
  const [displays, setDisplays] = useState<DisplayDescriptor[]>([])
  const [displayId, setDisplayId] = useState<number | null>(tv.displayId ?? null)
  const [diagonalIn, setDiagonalIn] = useState('55')
  const [dropCm, setDropCm] = useState(35)
  const [forwardCm, setForwardCm] = useState(10)
  const [probeIndex, setProbeIndex] = useState(0)
  const [observations, setObservations] = useState<ProbeObservation[]>([])
  const [capturing, setCapturing] = useState(false)
  const [captureMsg, setCaptureMsg] = useState('')
  const [residualMm, setResidualMm] = useState<number | null>(null)

  // Keep the latest streamed status for the capture sampler.
  const statusRef = useRef<EngineStatus | null>(status)
  statusRef.current = status

  // Marker for the current probe (fixed, known screen-space position).
  const currentMarker = (): ProbeMarker => {
    const p = PROBES[probeIndex]
    return {
      id: `${p.edge}-${probeIndex}`,
      edge: p.edge,
      position: grazingMarker(NOMINAL_EYE, p.edge, p.depthMm, tv.screen),
      color: p.color
    }
  }

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

  // Drive the reference scene: grid-only before probes, the active marker during.
  useEffect(() => {
    if (!hasBridge || !tvActive) return
    if (step === 3) {
      window.panorama.sendSceneCommand({
        type: 'calibration',
        state: { showGrid: true, markers: [currentMarker()] }
      })
    } else {
      window.panorama.sendSceneCommand({
        type: 'calibration',
        state: { showGrid: true, markers: [] }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, probeIndex, tvActive])

  const startTvMode = async () => {
    if (!hasBridge || displayId === null) return
    await window.panorama.setMode('tv', displayId)
    setStep(1)
  }

  const saveSize = () => {
    const screen = screenMmFromDiagonal(Number(diagonalIn) || 55, 16, 9)
    onUpdate({ profiles: { tv: { screen } } })
  }

  const saveSeed = () => {
    onUpdate({
      profiles: {
        tv: {
          placement: {
            ...tv.placement,
            position: { x: 0, y: -dropCm * 10, z: forwardCm * 10 }
          }
        }
      }
    })
  }

  const capture = () => {
    setCapturing(true)
    setCaptureMsg('Hold still…')
    const eyeX: number[] = []
    const eyeY: number[] = []
    const inter: number[] = []
    const yaw: number[] = []
    const t0 = performance.now()
    const id = window.setInterval(() => {
      const s = statusRef.current?.frame?.sample
      if (s && s.confidence > 0.5) {
        eyeX.push(s.eyeCenter.x)
        eyeY.push(s.eyeCenter.y)
        inter.push(s.interEyeNorm)
        yaw.push(s.yawDeg ?? 0)
      }
      if (performance.now() - t0 > 1200) {
        window.clearInterval(id)
        setCapturing(false)
        if (inter.length < 4) {
          setCaptureMsg('No steady face detected — make sure you are in view and try again.')
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
        const obs: ProbeObservation = {
          camEye,
          marker: currentMarker().position,
          edge: PROBES[probeIndex].edge
        }
        const next = [...observations, obs]
        setObservations(next)
        if (probeIndex + 1 < PROBES.length) {
          setProbeIndex(probeIndex + 1)
          setCaptureMsg('Captured. On to the next marker.')
        } else {
          runSolve(next)
        }
      }
    }, 60)
  }

  const runSolve = (obs: ProbeObservation[]) => {
    const res = solvePlacement(obs, tv.placement, tv.screen)
    onUpdate({ profiles: { tv: { placement: res.placement } } })
    setResidualMm(res.rmsResidualMm)
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
                Enter the <b>diagonal size</b> the TV is sold by. We assume a 16:9 screen.
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
                → {screenPreview.widthMm.toFixed(0)} mm wide × {screenPreview.heightMm.toFixed(0)}{' '}
                mm tall
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <h2>Roughly, where is the camera?</h2>
              <p>
                A rough guess is enough — the next step measures it precisely. Estimate how
                far the laptop camera sits <b>below the center of the TV</b> and how far it
                stands <b>in front</b> of the screen.
              </p>
              <label className="wizard-field">
                Camera below TV center (cm)
                <input
                  type="number"
                  value={dropCm}
                  onChange={(e) => setDropCm(Number(e.target.value))}
                  step="1"
                />
              </label>
              <label className="wizard-field">
                Camera in front of screen (cm)
                <input
                  type="number"
                  value={forwardCm}
                  onChange={(e) => setForwardCm(Number(e.target.value))}
                  step="1"
                />
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <h2>
                Marker {probeIndex + 1} of {PROBES.length}
              </h2>
              <p className="wizard-bigprompt">
                Move slowly until the <b>{PROBES[probeIndex].label}</b> marker is just
                touching the <b>{PROBES[probeIndex].edge}</b> edge of the TV — then hold
                still and press Capture.
              </p>
              <button className="wizard-capture" onClick={capture} disabled={capturing}>
                {capturing ? 'Capturing…' : 'Capture'}
              </button>
              {captureMsg && <p className="wizard-readout">{captureMsg}</p>}
              <p className="wizard-hint">
                Tracking: {status?.frame?.sample ? 'face locked' : 'no face — step into view'}
              </p>
            </>
          )}

          {step === 4 && (
            <>
              <h2>Fine-tune</h2>
              <p>
                Calibration solved
                {residualMm !== null && ` (fit ±${residualMm.toFixed(1)} mm)`}. Nudge if the
                window still looks off; the TV updates live.
              </p>
              <Slider
                label="Camera height vs TV center (mm)"
                min={-900}
                max={900}
                value={tv.placement.position.y}
                onChange={(v) => setPlacement({ y: v })}
              />
              <Slider
                label="Camera forward of screen (mm)"
                min={-200}
                max={1200}
                value={tv.placement.position.z}
                onChange={(v) => setPlacement({ z: v })}
              />
              <Slider
                label="Camera tilt / pitch (°)"
                min={-30}
                max={30}
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
            {step === 0 && (
              <button className="primary" onClick={startTvMode} disabled={!hasBridge || displayId === null}>
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
                  saveSeed()
                  setProbeIndex(0)
                  setObservations([])
                  setStep(3)
                }}
              >
                Start measuring
              </button>
            )}
            {step === 4 && (
              <button className="primary" onClick={finish}>
                Save & finish
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
  onChange
}: {
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="wizard-field">
      {label}: {value.toFixed(0)}
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
