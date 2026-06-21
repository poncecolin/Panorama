import { ThreeScene } from './types'
import { TestDepthScene } from './testDepth'
import { LandscapeScene } from './landscape/LandscapeScene'
import { SpaceStationScene } from './spaceStation/SpaceStationScene'

/** Scene catalog. Add new scenes here — the rest of the app is scene-agnostic. */
export const SCENES: { id: string; label: string; create: () => ThreeScene }[] = [
  { id: 'landscape', label: 'Landscape', create: () => new LandscapeScene() },
  { id: 'space', label: 'Space station', create: () => new SpaceStationScene() },
  { id: 'test', label: 'Test — depth boxes', create: () => new TestDepthScene() }
]

export function createScene(id: string): ThreeScene {
  const found = SCENES.find((s) => s.id === id) ?? SCENES[0]
  return found.create()
}
