import { useEffect, useRef } from 'react'
import { AppSettings } from '@shared/types'
import { createScene } from '@scenes/registry'
import { PanoramaEngine, EngineStatus } from './PanoramaEngine'

interface Props {
  settings: AppSettings
  onStatus?: (s: EngineStatus) => void
  onEngine?: (engine: PanoramaEngine | null) => void
}

/** Mounts the canvas and owns the PanoramaEngine lifecycle. */
export function WindowSurface({ settings, onStatus, onEngine }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<PanoramaEngine | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Create the engine once.
  useEffect(() => {
    const canvas = canvasRef.current!
    const engine = new PanoramaEngine(settingsRef.current)
    engineRef.current = engine
    onEngine?.(engine)
    const unsub = onStatus ? engine.onStatus(onStatus) : undefined
    engine.start(canvas, createScene(settingsRef.current.activeSceneId))

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

  // Swap scene when the selection changes.
  useEffect(() => {
    engineRef.current?.setScene(createScene(settings.activeSceneId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.activeSceneId])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  )
}
