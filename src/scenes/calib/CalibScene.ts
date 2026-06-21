import * as THREE from 'three'
import { CalibrationSceneState, ProbeMarker, ScreenEdge, Vec3 } from '@shared/types'
import { SceneBase } from '../lib/SceneBase'
import { SceneEnv } from '../types'
import { canvasTexture } from '../lib/textures'

/**
 * The TV-calibration reference scene. It is not a hero scene — it is a measuring
 * instrument. Two cues make placement error visible:
 *
 *  - a **symmetry grid** on a wall behind the glass with a bright center cross,
 *    which only reads centered & square when the eye is on the screen's axis;
 *  - **probe markers**: bright cubes behind the glass positioned to graze a screen
 *    edge at a known eye plane, so "sidestep until the cube appears at the edge"
 *    is a geometric constraint the wizard captures (see core/geometry/tvCalibration).
 *
 * The wizard drives which markers/grid show via {@link setCalibrationState}. Shown
 * standalone (`?selftest=render&scene=calib`) it displays a default probe set so
 * the appear/disappear behavior can be checked deterministically with
 * `window.panoramaSetEye`.
 *
 * Coordinates are screen-space mm (z = 0 is the glass, negative Z behind it).
 */
const GRID_Z = -1500
const MARKER_SIZE = 70

/** Marker depth (behind glass) used for the standalone default probe set. */
const DEFAULT_MARKER_Z = -900
/** Nominal eye distance the default markers are arranged to graze from. */
const DEFAULT_EYE_Z = 700

/** Screen-space position of a marker at depth `mz` that grazes `edge` from eye `E`. */
export function grazingMarker(
  E: Vec3,
  edge: ScreenEdge,
  mz: number,
  screen: { widthMm: number; heightMm: number }
): Vec3 {
  const t = E.z / (E.z - mz)
  const halfW = screen.widthMm / 2
  const halfH = screen.heightMm / 2
  switch (edge) {
    case 'right':
      return { x: E.x + (halfW - E.x) / t, y: E.y, z: mz }
    case 'left':
      return { x: E.x + (-halfW - E.x) / t, y: E.y, z: mz }
    case 'top':
      return { x: E.x, y: E.y + (halfH - E.y) / t, z: mz }
    case 'bottom':
      return { x: E.x, y: E.y + (-halfH - E.y) / t, z: mz }
  }
}

const EDGE_COLORS: Record<ScreenEdge, number> = {
  right: 0xff3b3b,
  left: 0x3bff7a,
  top: 0x4fa8ff,
  bottom: 0xffd23b
}

export class CalibScene extends SceneBase {
  id = 'calib'
  label = 'Calibration reference'

  private markerGroup = new THREE.Group()
  private grid: THREE.Mesh | null = null
  private cross: THREE.Group | null = null
  private state: CalibrationSceneState | null = null

  protected buildScene(env: SceneEnv): void {
    env.scene.background = new THREE.Color(0x05070d)
    this.root.add(new THREE.AmbientLight(0xffffff, 1.0))

    // Symmetry grid wall well behind the glass.
    const tex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#0e1626'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(120,160,220,0.55)'
      ctx.lineWidth = 3
      for (let i = 0; i <= w; i += 32) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i, h)
        ctx.moveTo(0, i)
        ctx.lineTo(w, i)
        ctx.stroke()
      }
    })
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(24, 14)
    this.grid = new THREE.Mesh(
      new THREE.PlaneGeometry(12000, 7000),
      new THREE.MeshBasicMaterial({ map: tex })
    )
    this.grid.position.set(0, 0, GRID_Z)
    this.root.add(this.grid)

    // Bright center cross on the grid — the head-on alignment target.
    this.cross = new THREE.Group()
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(18, 1600, 18), crossMat)
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(1600, 18, 18), crossMat)
    this.cross.add(vBar, hBar)
    this.cross.position.set(0, 0, GRID_Z + 10)
    this.root.add(this.cross)

    this.root.add(this.markerGroup)
    this.applyState()
  }

  /** Update the displayed probe markers / grid. Driven by the wizard. */
  setCalibrationState(state: CalibrationSceneState): void {
    this.state = state
    if (this.env) this.applyState()
  }

  private defaultState(): CalibrationSceneState {
    const E: Vec3 = { x: 0, y: 0, z: DEFAULT_EYE_Z }
    const screen = this.env.screen
    const edges: ScreenEdge[] = ['left', 'right', 'top', 'bottom']
    const markers: ProbeMarker[] = edges.map((edge) => ({
      id: edge,
      edge,
      position: grazingMarker(E, edge, DEFAULT_MARKER_Z, screen),
      color: EDGE_COLORS[edge]
    }))
    return { showGrid: true, markers }
  }

  private applyState(): void {
    const state = this.state ?? this.defaultState()

    if (this.grid) this.grid.visible = state.showGrid
    if (this.cross) this.cross.visible = state.showGrid

    // Rebuild the marker cubes.
    for (const child of [...this.markerGroup.children]) {
      this.markerGroup.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    }
    for (const m of state.markers) {
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(MARKER_SIZE, MARKER_SIZE, MARKER_SIZE),
        new THREE.MeshBasicMaterial({ color: m.color ?? 0xff3b3b })
      )
      cube.position.set(m.position.x, m.position.y, m.position.z)
      cube.name = m.id
      this.markerGroup.add(cube)
    }
  }

  update(_dtMs: number, elapsedMs: number): void {
    // A gentle pulse so markers read as "live" and easy to spot at the edge.
    const s = 1 + Math.sin(elapsedMs / 250) * 0.12
    for (const child of this.markerGroup.children) child.scale.setScalar(s)
  }

  protected disposeScene(): void {
    this.grid = null
    this.cross = null
    this.state = null
  }
}
