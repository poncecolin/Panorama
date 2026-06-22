import { useEffect, useRef, useState } from 'react'
import { AppSettings, DEFAULTS, SettingsPatch } from '@shared/types'
import { screenMmFromDiagonal, fovFromObservation } from '@shared/calibration'
import { TrackerFrame } from '@core/tracker/types'
import { hasBridge } from '../state/useSettings'

interface Props {
  settings: AppSettings
  onUpdate: (patch: SettingsPatch) => void
  onClose: () => void
  getFrame: () => TrackerFrame | null
}

const STEP_TITLES = ['Welcome', 'Screen size', 'Your eyes', 'Your camera', 'All set']

export function CalibrationWizard({ settings, onUpdate, onClose, getFrame }: Props) {
  const [step, setStep] = useState(0)
  const [aspect, setAspect] = useState({ w: 16, h: 10 })

  // This wizard calibrates the built-in laptop setup. Seed the diagonal from its
  // existing screen size.
  const laptop = settings.profiles.laptop
  const seededDiag =
    Math.hypot(laptop.screen.widthMm, laptop.screen.heightMm) / 25.4
  const [diagonalIn, setDiagonalIn] = useState(seededDiag.toFixed(1))
  const [ipdMm, setIpdMm] = useState(settings.viewer.ipdMm)
  const [distanceCm, setDistanceCm] = useState(60)
  const [capturedFov, setCapturedFov] = useState<number | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [captureMsg, setCaptureMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let w = window.screen?.width ?? 16
      let h = window.screen?.height ?? 10
      if (hasBridge) {
        const info = await window.panorama.getDisplayInfo()
        w = info.width
        h = info.height
      }
      if (!cancelled && w > 0 && h > 0) setAspect({ w, h })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const screen = screenMmFromDiagonal(Number(diagonalIn) || seededDiag, aspect.w, aspect.h)

  const capture = () => {
    setCapturing(true)
    setCaptureMsg('Hold still…')
    const samples: number[] = []
    const t0 = performance.now()
    const id = window.setInterval(() => {
      const s = getFrame()?.sample
      if (s) samples.push(s.interEyeNorm)
      if (performance.now() - t0 > 1500) {
        window.clearInterval(id)
        setCapturing(false)
        if (samples.length < 3) {
          setCaptureMsg('No face detected — make sure you are in view and try again.')
          return
        }
        samples.sort((a, b) => a - b)
        const median = samples[Math.floor(samples.length / 2)]
        const fov = fovFromObservation(distanceCm * 10, median, ipdMm)
        setCapturedFov(fov)
        setCaptureMsg(`Got it — your camera looks like about ${fov.toFixed(0)}° wide.`)
      }
    }, 100)
  }

  const finish = () => {
    const heightMm = screen.heightMm
    onUpdate({
      viewer: { ipdMm },
      intrinsics: {
        ...settings.intrinsics,
        horizontalFovDeg: capturedFov ?? settings.intrinsics.horizontalFovDeg
      },
      profiles: {
        laptop: {
          screen,
          // Keep the "camera just above the top edge" assumption consistent with
          // the newly measured screen height.
          placement: {
            ...laptop.placement,
            position: {
              x: 0,
              y: heightMm / 2 + DEFAULTS.cameraAboveTopEdgeMm,
              z: 0
            }
          }
        }
      },
      activeProfile: 'laptop',
      calibrated: true
    })
    onClose()
  }

  const next = () => setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wizard" onClick={(e) => e.stopPropagation()}>
        <div className="wizard-steps">
          {STEP_TITLES.map((t, i) => (
            <span key={t} className={`wizard-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              {t}
            </span>
          ))}
        </div>

        <div className="wizard-body">
          {step === 0 && (
            <>
              <h2>Let's make the window feel real</h2>
              <p>
                Panorama already works out of the box. This optional setup teaches it
                three things about <i>your</i> setup so the 3D effect lines up
                precisely: how big your screen is, how far apart your eyes are, and
                what lens your camera has. Takes about a minute. You can skip anytime.
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <h2>How big is your screen?</h2>
              <p>
                Panorama treats your screen like a pane of glass, so it needs the real
                size. Enter the <b>diagonal size</b> — the number laptops and TVs are
                sold by (e.g. a “15-inch” laptop). We work out the width and height
                from your display's shape.
              </p>
              <label className="wizard-field">
                Diagonal size (inches)
                <input
                  type="number"
                  value={diagonalIn}
                  onChange={(e) => setDiagonalIn(e.target.value)}
                  step="0.1"
                  min="5"
                />
              </label>
              <p className="wizard-readout">
                → {screen.widthMm.toFixed(0)} mm wide × {screen.heightMm.toFixed(0)} mm
                tall (using a {aspect.w}:{aspect.h} display)
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <h2>How far apart are your eyes?</h2>
              <p>
                This is your <b>pupillary distance (PD)</b> — the gap between the
                centers of your pupils. Panorama uses it to judge how far away you are
                from the camera. The average is about 63 mm.
              </p>
              <p className="wizard-hint">
                You can leave the average, measure it in a mirror with a ruler, or read
                the “PD” number off a recent eyeglasses prescription.
              </p>
              <label className="wizard-field">
                Pupillary distance (mm)
                <input
                  type="number"
                  value={ipdMm}
                  onChange={(e) => setIpdMm(Number(e.target.value))}
                  step="1"
                  min="40"
                  max="80"
                />
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <h2>Teach Panorama your camera's lens</h2>
              <p>
                Cameras vary in how wide they see. We can measure yours: grab a tape
                measure, sit so your eyes are exactly the distance below from the
                screen, hold still, and press Capture. <b>Optional</b> — skip to keep a
                sensible default ({settings.intrinsics.horizontalFovDeg.toFixed(0)}°).
              </p>
              <label className="wizard-field">
                I'm sitting this far from the screen (cm)
                <input
                  type="number"
                  value={distanceCm}
                  onChange={(e) => setDistanceCm(Number(e.target.value))}
                  step="1"
                  min="20"
                  max="200"
                />
              </label>
              <button className="wizard-capture" onClick={capture} disabled={capturing}>
                {capturing ? 'Capturing…' : 'Capture'}
              </button>
              {captureMsg && <p className="wizard-readout">{captureMsg}</p>}
            </>
          )}

          {step === 4 && (
            <>
              <h2>You're all set</h2>
              <p>Panorama will use these values:</p>
              <ul className="wizard-summary">
                <li>
                  Screen: <b>{screen.widthMm.toFixed(0)} × {screen.heightMm.toFixed(0)} mm</b>
                </li>
                <li>
                  Pupillary distance: <b>{ipdMm} mm</b>
                </li>
                <li>
                  Camera field of view:{' '}
                  <b>
                    {(capturedFov ?? settings.intrinsics.horizontalFovDeg).toFixed(0)}°
                  </b>{' '}
                  {capturedFov ? '(measured)' : '(default)'}
                </li>
              </ul>
            </>
          )}
        </div>

        <div className="wizard-nav">
          <button className="wizard-skip" onClick={onClose}>
            Skip
          </button>
          <div className="wizard-nav-right">
            {step > 0 && (
              <button onClick={back} disabled={capturing}>
                Back
              </button>
            )}
            {step < STEP_TITLES.length - 1 ? (
              <button className="primary" onClick={next} disabled={capturing}>
                Next
              </button>
            ) : (
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
