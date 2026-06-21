import { useEffect, useRef } from 'react'
import { ThreeRenderer } from '@core/render/ThreeRenderer'
import { offAxisProjection } from '@core/geometry/projection'
import { computeApproachDolly } from '@core/geometry/dolly'
import { createScene } from '@scenes/registry'
import { DEFAULT_TUNING, DEFAULTS, EyePose, Vec3 } from '@shared/types'

// Use the app's default screen/frustum so the harness frames scenes the same way
// the real app does out of the box.
const SCREEN = { w: DEFAULTS.screenWidthMm, h: DEFAULTS.screenHeightMm }
const NEAR = DEFAULTS.nearPlaneMm
const FAR = DEFAULTS.farPlaneMm

/**
 * Illusion checkpoint harness (?selftest=render). Renders the depth test scene
 * and drives the off-axis camera from a virtual eye position. Exposes
 * window.panoramaSetEye(x,y,z) so the eye can be moved and screenshotted to
 * confirm parallax / look-around without needing a webcam.
 */
export function RenderSelfTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const renderer = new ThreeRenderer()
    renderer.init(canvas)
    renderer.setScreen(SCREEN.w, SCREEN.h)

    const eye: Vec3 = { x: 0, y: 0, z: 600 }
    const applyEye = () => {
      const pose: EyePose = {
        eyeMm: eye,
        projection: offAxisProjection(eye, SCREEN.w, SCREEN.h, NEAR, FAR),
        tracked: true
      }
      renderer.setEyePose(pose)
      // Exaggerated dolly gain (the app default is 0) so moving the eye in Z
      // visibly shows the "dive-in" looming in the harness.
      renderer.setSceneDollyZ(computeApproachDolly(eye.z, DEFAULT_TUNING.approachRestMm, 6.0))
    }

    const resize = () => {
      renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)
    ;(window as unknown as { panoramaSetEye: (x: number, y: number, z: number) => void }).panoramaSetEye =
      (x, y, z) => {
        eye.x = x
        eye.y = y
        eye.z = z
        applyEye()
      }

    const sceneId = new URLSearchParams(location.search).get('scene') || 'test'
    let scene: ReturnType<typeof createScene> | null = createScene(sceneId)
    let raf = 0
    let last = performance.now()
    let started = false
    ;(async () => {
      await renderer.loadScene(scene!)
      applyEye()
      started = true
    })()

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const now = performance.now()
      const dt = now - last
      last = now
      if (started) renderer.render(dt)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      scene = null
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  )
}
