import * as THREE from 'three'
import { ThreeScene, SceneEnv, AttractSample } from './types'

/**
 * Diagnostic scene for the illusion checkpoint (M4). Packs strong depth cues —
 * near foreground pillars, a midground field, a gridded floor and back wall, and
 * fog — so head movement produces obvious parallax and "look around near objects"
 * occlusion. Not a shipping scene; the polished hero scene is the landscape (M5).
 */
export class TestDepthScene implements ThreeScene {
  id = 'test'
  label = 'Test — depth boxes'

  private root = new THREE.Group()
  private spinners: THREE.Object3D[] = []
  private orbiter: THREE.Object3D | null = null

  build(env: SceneEnv): void {
    const { scene } = env
    scene.background = new THREE.Color(0x0b1020)
    scene.fog = new THREE.Fog(0x0b1020, 1500, 9000)

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xfff2d8, 1.1)
    key.position.set(800, 1400, 600)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x88aaff, 0.4)
    fill.position.set(-700, 300, 400)
    scene.add(fill)

    const gridTex = makeGridTexture()

    const FLOOR_Y = -600

    // Back wall.
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(16000, 9000),
      new THREE.MeshStandardMaterial({ map: gridTex.clone(), color: 0x33406b })
    )
    wall.position.set(0, 800, -6500)
    this.root.add(wall)

    // Floor.
    const floorTex = makeGridTexture()
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
    floorTex.repeat.set(24, 24)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16000, 16000),
      new THREE.MeshStandardMaterial({ map: floorTex, color: 0x222a44 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, FLOOR_Y, -3500)
    this.root.add(floor)

    // Near foreground pillars at the sides (frame the view) — biggest parallax.
    this.root.add(pillar(-240, -750, 0xff6b6b, 520, FLOOR_Y))
    this.root.add(pillar(245, -900, 0x46d18a, 600, FLOOR_Y))

    // Midground field of cubes around eye level at staggered depths/positions.
    const palette = [0x5b9dff, 0xffce5b, 0xc792ea, 0x80d8ff, 0xff9e64]
    let ci = 0
    for (let x = -1700; x <= 1700; x += 680) {
      for (let z = -1500; z >= -4200; z -= 900) {
        const s = 240 + Math.random() * 140
        const cube = new THREE.Mesh(
          new THREE.BoxGeometry(s, s, s),
          new THREE.MeshStandardMaterial({ color: palette[ci++ % palette.length] })
        )
        cube.position.set(
          x + (Math.random() - 0.5) * 240,
          FLOOR_Y + s / 2,
          z + (Math.random() - 0.5) * 240
        )
        cube.rotation.y = Math.random() * Math.PI
        this.spinners.push(cube)
        this.root.add(cube)
      }
    }

    // A sphere orbiting near eye level for continuous motion.
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(220, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.3 })
    )
    this.orbiter = orb
    this.root.add(orb)

    env.scene.add(this.root)
  }

  setWindowHeightMm(mm: number): void {
    // Floor is authored at y=-600; offset so it sits mm below the glass center.
    this.root.position.y = -mm - -600
  }

  update(_dtMs: number, elapsedMs: number): void {
    const t = elapsedMs / 1000
    for (let i = 0; i < this.spinners.length; i++) {
      this.spinners[i].rotation.y = t * 0.3 + i
    }
    if (this.orbiter) {
      this.orbiter.position.set(
        Math.cos(t * 0.4) * 1400,
        100 + Math.sin(t * 0.8) * 180,
        -2200 + Math.sin(t * 0.4) * 700
      )
    }
  }

  attractEye(elapsedMs: number): AttractSample {
    const t = elapsedMs / 1000
    return {
      eye: { x: Math.sin(t * 0.25) * 220, y: 40 + Math.sin(t * 0.17) * 60, z: 620 }
    }
  }

  dispose(): void {
    this.spinners = []
    this.orbiter = null
  }
}

function pillar(
  x: number,
  z: number,
  color: number,
  h: number,
  floorY: number
): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(90, h, 90),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
  )
  m.position.set(x, floorY + h / 2, z)
  return m
}

/** Procedural grid texture for the wall/floor (depth reference). */
function makeGridTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 4
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 256)
    ctx.moveTo(0, i)
    ctx.lineTo(256, i)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
