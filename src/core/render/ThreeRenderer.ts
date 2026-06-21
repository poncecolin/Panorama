import * as THREE from 'three'
import { EyePose } from '@shared/types'
import { SceneRenderer } from './types'
import { ThreeScene, SceneEnv } from '@scenes/types'

/**
 * Phase 1 renderer (WebGL via Three.js). The viewer's eye drives an off-axis
 * (asymmetric-frustum) projection supplied by the GeometrySolver: we place the
 * camera at the metric eye position (mm), keep its orientation fixed looking down
 * -Z (into the scene behind the glass), and override its projection matrix.
 */
export class ThreeRenderer implements SceneRenderer<ThreeScene> {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private current: ThreeScene | null = null
  private elapsed = 0
  private screen = { widthMm: 300, heightMm: 200 }

  init(canvas: HTMLCanvasElement): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    })
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()

    // Projection is overridden each frame; near/far are placeholders.
    this.camera = new THREE.PerspectiveCamera(60, 1, 10, 200000)
    this.camera.position.set(0, 0, 600)
  }

  /** Physical screen size (mm) the off-axis projection is built for. */
  setScreen(widthMm: number, heightMm: number): void {
    this.screen = { widthMm, heightMm }
  }

  resize(width: number, height: number, dpr: number): void {
    this.renderer.setPixelRatio(Math.min(dpr, 2))
    this.renderer.setSize(width, height, false)
  }

  async loadScene(scene: ThreeScene): Promise<void> {
    if (this.current) {
      this.current.dispose()
      this.disposeSceneGraph()
    }
    this.scene = new THREE.Scene()
    const env: SceneEnv = {
      scene: this.scene,
      renderer: this.renderer,
      screen: this.screen
    }
    await scene.build(env)
    this.current = scene
    this.elapsed = 0
  }

  /** Translate the scene content toward (+) or away from (-) the viewer, in mm.
   *  Drives the "dive-in" looming effect; the sky background is unaffected. */
  setSceneDollyZ(z: number): void {
    if (this.scene) this.scene.position.z = z
  }

  setEyePose(pose: EyePose): void {
    // Rotation is identity on purpose: the off-axis ("window") effect lives
    // entirely in the asymmetric projection matrix, not in where the camera
    // points. With identity rotation the camera's basis equals world/screen
    // space, so the view matrix is just translate(-eye) — exactly what the
    // Kooima projection in `offAxisProjection` assumes.
    this.camera.position.set(pose.eyeMm.x, pose.eyeMm.y, pose.eyeMm.z)
    this.camera.quaternion.identity()
    this.camera.updateMatrix()
    this.camera.updateMatrixWorld(true)
    this.camera.projectionMatrix.fromArray(pose.projection)
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()
  }

  render(dtMs: number): void {
    this.elapsed += dtMs
    this.current?.update(dtMs, this.elapsed)
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.current?.dispose()
    this.disposeSceneGraph()
    this.renderer.dispose()
  }

  private disposeSceneGraph(): void {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
    })
  }
}
