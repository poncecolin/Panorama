import { useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { MediaPipeFaceTracker } from '@core/tracker/MediaPipeFaceTracker'
import { TrackerFrame } from '@core/tracker/types'

/**
 * Verification harness.
 *   ?selftest=tracker     → init-only: load wasm + model, report ready.
 *   ?selftest=track-live  → full pipeline driven by a synthetic camera (a still
 *                           face image via canvas.captureStream), reporting the
 *                           detected eyes / lock / ViewerSample. Lets us validate
 *                           detect→landmarks→lock→sample without a real webcam.
 */
export function TrackerSelfTest() {
  const mode =
    new URLSearchParams(location.search).get('selftest') === 'track-live'
      ? 'live'
      : 'init'
  const [status, setStatus] = useState('starting…')
  const [detail, setDetail] = useState('')
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const t0 = useRef(performance.now())

  useEffect(() => {
    if (mode === 'init') return runInit(setStatus, setDetail, t0.current)
    return runLive(setStatus, setDetail, setStats)
  }, [mode])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        color: '#e8ecf3'
      }}
    >
      <div style={{ fontSize: 26 }}>Tracker self-test · {mode}</div>
      <div data-testid="selftest-status" style={{ fontSize: 22 }}>
        {status}
      </div>
      <div style={{ opacity: 0.7, maxWidth: 640, textAlign: 'center' }}>{detail}</div>
      {stats && (
        <pre
          data-testid="selftest-stats"
          style={{ fontSize: 13, background: '#11141c', padding: 12, borderRadius: 8 }}
        >
          {JSON.stringify(stats, null, 2)}
        </pre>
      )}
    </div>
  )
}

function runInit(
  setStatus: (s: string) => void,
  setDetail: (s: string) => void,
  t0: number
) {
  let landmarker: FaceLandmarker | null = null
  let cancelled = false
  ;(async () => {
    try {
      const fileset = await FilesetResolver.forVisionTasks(
        new URL('mediapipe/wasm', document.baseURI).href
      )
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: new URL(
            'mediapipe/models/face_landmarker.task',
            document.baseURI
          ).href,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numFaces: 3
      })
      if (cancelled) return
      setStatus('READY ✅')
      setDetail(`FaceLandmarker initialized in ${(performance.now() - t0).toFixed(0)} ms`)
    } catch (err) {
      if (cancelled) return
      setStatus('ERROR ❌')
      setDetail(err instanceof Error ? err.message : String(err))
    }
  })()
  return () => {
    cancelled = true
    landmarker?.close()
  }
}

function runLive(
  setStatus: (s: string) => void,
  setDetail: (s: string) => void,
  setStats: (s: Record<string, unknown>) => void
) {
  let tracker: MediaPipeFaceTracker | null = null
  let raf = 0
  let cancelled = false
  let frameCount = 0
  let detectedOnce = false

  ;(async () => {
    try {
      // Build a synthetic camera from a still face image.
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('failed to load /test/face.jpg'))
        img.src = '/test/face.jpg'
      })
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      const ctx = canvas.getContext('2d')!
      const draw = () => {
        // cover-fit the portrait into the frame
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
        if (!cancelled) raf = requestAnimationFrame(draw)
      }
      draw()
      const stream = canvas.captureStream(15)

      tracker = new MediaPipeFaceTracker({ getStream: async () => stream })
      tracker.onFrame((f: TrackerFrame) => {
        frameCount++
        if (f.faces.length > 0) detectedOnce = true
        setStats({
          frames: frameCount,
          facesDetected: f.faces.length,
          lockedFaceId: f.sample?.faceId ?? null,
          eyeCenter: f.sample
            ? { x: +f.sample.eyeCenter.x.toFixed(3), y: +f.sample.eyeCenter.y.toFixed(3) }
            : null,
          interEyeNorm: f.sample ? +f.sample.interEyeNorm.toFixed(4) : null,
          detectMs: +f.detectMs.toFixed(1),
          detectFps: +f.detectFps.toFixed(1)
        })
        if (detectedOnce && f.sample) {
          setStatus('LIVE PIPELINE OK ✅')
          setDetail('Detected a face from the synthetic camera and produced a ViewerSample.')
        } else if (frameCount > 20 && !detectedOnce) {
          setStatus('NO FACE ⚠️')
          setDetail('Pipeline ran but no face detected in the test image.')
        }
      })
      setStatus('running…')
      await tracker.start()
    } catch (err) {
      if (cancelled) return
      setStatus('ERROR ❌')
      setDetail(err instanceof Error ? err.message : String(err))
    }
  })()

  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
    tracker?.stop()
  }
}
