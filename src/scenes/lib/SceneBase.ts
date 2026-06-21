import * as THREE from 'three'
import { ThreeScene, SceneEnv } from '../types'

/**
 * Base class for Panorama scenes. It captures the scaffolding every scene shares
 * so concrete scenes only write content:
 *
 *   - owns a `root` THREE.Group (added to the scene for you) to parent all scene
 *     objects, so a scene can be transformed/removed as a unit;
 *   - stores the `SceneEnv` for later use (renderer, screen size);
 *   - wires the {@link ThreeScene} `build`/`dispose` lifecycle to the simpler
 *     `buildScene`/`disposeScene` hooks.
 *
 * To add a scene: extend this class, set `id`/`label`, populate `this.root` in
 * `buildScene`, animate in `update`, and (optionally) override `attractEye` and
 * `setWindowHeightMm`. Register it in `src/scenes/registry.ts`.
 *
 * Coordinates are millimetres; the screen ("glass") is centred at the origin in
 * the z=0 plane and the scene lives at negative Z (behind the glass).
 */
export abstract class SceneBase implements ThreeScene {
  abstract id: string
  abstract label: string

  /** Parent of all scene content. Added to env.scene by `build`. */
  protected root = new THREE.Group()
  /** Build environment, retained for renderer/screen access after build. */
  protected env!: SceneEnv

  async build(env: SceneEnv): Promise<void> {
    this.env = env
    await this.buildScene(env)
    env.scene.add(this.root)
  }

  /** Populate `this.root` (and configure `env.scene`, e.g. background/fog). */
  protected abstract buildScene(env: SceneEnv): Promise<void> | void

  abstract update(dtMs: number, elapsedMs: number): void

  dispose(): void {
    this.disposeScene()
  }

  /** Release scene-specific references (animation lists, cached objects). The
   *  renderer disposes the actual GPU geometry/materials when it tears down the
   *  scene graph, so subclasses only need to clear their own bookkeeping. */
  protected disposeScene(): void {}
}
