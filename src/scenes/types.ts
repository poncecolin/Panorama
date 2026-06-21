import * as THREE from 'three'
import { Vec3 } from '@shared/types'

/** What a scene receives to build itself. Coordinates are in millimetres; the
 *  screen ("glass") is the rectangle of size screen.* centered at the origin in
 *  the z=0 plane, with the scene extending to negative Z (behind the glass). */
export interface SceneEnv {
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  screen: { widthMm: number; heightMm: number }
}

/** A virtual viewpoint used to drift the camera in attract mode. */
export interface AttractSample {
  eye: Vec3
}

/**
 * The scene-content boundary. Scenes are authored against Three.js for Phase 1;
 * keeping this interface small makes new scenes (and future content pipelines)
 * easy to add without touching tracking, geometry, or the renderer.
 */
export interface ThreeScene {
  id: string
  label: string
  build(env: SceneEnv): Promise<void> | void
  /** Animate the scene. dt = ms since last frame, elapsed = ms since build. */
  update(dtMs: number, elapsedMs: number): void
  /**
   * Set how high the window sits above the virtual ground (mm). Scenes implement
   * this by vertically offsetting their ground content so the viewer looks
   * straight out (low) or down over the land (high). Sky content stays put.
   */
  setWindowHeightMm?(mm: number): void
  /**
   * Optional cinematic viewpoint for attract mode (no viewer present). Returns a
   * virtual eye position (mm) that the renderer feeds through the same off-axis
   * projection, so attract drift exhibits real parallax. Defaults are supplied
   * by the lifecycle controller when omitted.
   */
  attractEye?(elapsedMs: number): AttractSample
  dispose(): void
}
