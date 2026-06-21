import { useEffect, useRef } from 'react'
import { AppSettings, CalibrationSceneState } from '@shared/types'
import { createScene } from '@scenes/registry'
import { PanoramaEngine, EngineStatus } from './PanoramaEngine'

interface Props {
  settings: AppSettings
  onStatus?: (s: EngineStatus) => void
  onEngine?: (engine: PanoramaEngine | null) => void
  /** Force a specific scene (e.g. 'calib' during TV calibration), overriding settings. */
  sceneIdOverride?: string
  /** Probe markers/grid for the calibration reference scene. */
  calibrationState?: CalibrationSceneState | null
}

/** Mounts the canvas and owns the PanoramaEngine lifecycle. */
export function WindowSurface({
  settings,
  onStatus,
  onEngine,
  sceneIdOverride,
  calibrationState
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<PanoramaEngine | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const effectiveSceneId = sceneIdOverride ?? settings.activeSceneId

  // Create the engine once.
  useEffect(() => {
    const canvas = canvasRef.current!
    const engine = new PanoramaEngine(settingsRef.current)
    engineRef.current = engine
    onEngine?.(engine)
    const unsub = onStatus ? engine.onStatus(onStatus) : undefined
    engine.start(canvas, createScene(effectiveSceneId))

    const ro = new ResizeObserver(() => engine.resize(canvas))
    ro.observe(canvas)

    return () => {
      ro.disconnect()
      unsub?.()
      engine.stop()
      engineRef.current = null
      onEngine?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push live settings (screen size, tuning, calibration) to the running engine.
  useEffect(() => {
    engineRef.current?.updateSettings(settings)
  }, [settings])

  // Swap scene when the effective selection changes.
  useEffect(() => {
    engineRef.current?.setScene(createScene(effectiveSceneId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSceneId])

  // Drive the calibration reference scene's probe markers.
  useEffect(() => {
    if (calibrationState) engineRef.current?.setCalibrationState(calibrationState)
  }, [calibrationState])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  )
}
