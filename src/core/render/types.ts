import { EyePose } from '@shared/types'

/**
 * The scene-renderer boundary — the main swappable engine seam. Phase 1 ships
 * ThreeRenderer (WebGL); Phase 3 could provide an Unreal/pixel-stream renderer
 * behind this same interface.
 */
export interface SceneRenderer<TScene = unknown> {
  init(canvas: HTMLCanvasElement): void
  resize(width: number, height: number, dpr: number): void
  loadScene(scene: TScene): Promise<void>
  /** Drive the off-axis camera from the solved viewer pose. */
  setEyePose(pose: EyePose): void
  /** Advance + draw one frame. */
  render(dtMs: number): void
  dispose(): void
}
