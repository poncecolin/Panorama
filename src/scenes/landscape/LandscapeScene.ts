import * as THREE from 'three'
import { SceneEnv, AttractSample } from '../types'
import { SceneBase } from '../lib/SceneBase'
import { canvasTexture } from '../lib/textures'
import { sinusoidalDrift } from '../lib/drift'

/**
 * Phase 1 hero scene: a calm valley at golden hour. Fully procedural (no external
 * assets). Depth and richness come from rolling shadowed terrain, layered ridges
 * fading into haze, clustered pines, scattered rocks/shrubs, drifting clouds and
 * gliding birds — all parallaxing correctly under the off-axis camera.
 *
 * Coordinate frame: millimetres, glass at z=0, scene at -z. The inherited `root`
 * holds sky content (sun, clouds, birds) and is fixed; ground content lives in a
 * separate `groundGroup` so the window-height knob can slide the land up/down
 * without moving the sky.
 */
export class LandscapeScene extends SceneBase {
  id = 'landscape'
  label = 'Landscape'

  /** Ground-anchored content (terrain, ridges, trees, rocks) — shifts with height. */
  private groundGroup = new THREE.Group()
  private clouds: { mesh: THREE.Mesh; speed: number }[] = []
  private trees: { mesh: THREE.Object3D; phase: number; amp: number }[] = []
  private birds: { mesh: THREE.Group; phase: number; wings: THREE.Object3D[] }[] = []
  private sun: THREE.Mesh | null = null

  /** Y of the ground datum; window-height offset is measured from here. */
  private readonly groundY = -500
  private readonly terrainCenterZ = -11000

  protected buildScene(env: SceneEnv): void {
    const { scene } = env
    scene.background = this.makeSky()
    scene.fog = new THREE.Fog(0xe9c9a0, 3500, 17000)

    // ---- Lighting (warm low sun + cool sky fill) ----
    scene.add(new THREE.HemisphereLight(0xbcd3ff, 0x5a4a30, 0.85))
    scene.add(new THREE.AmbientLight(0xffffff, 0.22))
    const sun = new THREE.DirectionalLight(0xffd49a, 2.3)
    sun.position.set(-7000, 5200, 1200)
    sun.target.position.set(0, this.groundY, -9000)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 40
    const cam = sun.shadow.camera
    cam.near = 100
    cam.far = 40000
    cam.left = -14000
    cam.right = 14000
    cam.top = 14000
    cam.bottom = -14000
    cam.updateProjectionMatrix()
    this.groundGroup.add(sun)
    this.groundGroup.add(sun.target)

    // ---- Sun disc glow near the horizon ----
    this.sun = new THREE.Mesh(
      new THREE.CircleGeometry(900, 48),
      new THREE.MeshBasicMaterial({ map: this.makeGlow(), transparent: true, depthWrite: false })
    )
    this.sun.position.set(-2600, 900, -9200)
    this.root.add(this.sun)

    // ---- Distant atmospheric ridges (far → near, hazier when far) ----
    this.addRidge(-9500, 1500, 0xcdd6e2)
    this.addRidge(-7600, 1250, 0xa6b3c8, true)
    this.addRidge(-5800, 1000, 0x7e8fa8)

    // ---- Rolling terrain ----
    this.addTerrain()

    // ---- Vegetation & rocks placed on the terrain surface ----
    this.addTrees()
    this.addRocks()
    this.addShrubs()

    // ---- Drifting clouds ----
    this.addClouds()

    // ---- Gliding birds ----
    this.addBirds()

    // (the inherited `root` is added to the scene by SceneBase.build)
    scene.add(this.groundGroup)
  }

  /** Raise/lower the terrain so the window sits `mm` above the ground. */
  setWindowHeightMm(mm: number): void {
    this.groundGroup.position.y = -mm - this.groundY
  }

  update(dtMs: number, elapsedMs: number): void {
    const t = elapsedMs / 1000
    const dt = dtMs / 1000
    for (const c of this.clouds) {
      c.mesh.position.x += dt * c.speed
      if (c.mesh.position.x > 9000) c.mesh.position.x = -9000
    }
    for (const tr of this.trees) {
      tr.mesh.rotation.z = Math.sin(t * 0.7 + tr.phase) * tr.amp
    }
    for (const b of this.birds) {
      b.mesh.position.x += dt * 320
      if (b.mesh.position.x > 9000) b.mesh.position.x = -9000
      const flap = Math.sin(t * 6 + b.phase) * 0.5
      b.wings[0].rotation.z = flap
      b.wings[1].rotation.z = -flap
      b.mesh.position.y += Math.sin(t * 1.2 + b.phase) * dt * 60
    }
  }

  attractEye(elapsedMs: number): AttractSample {
    return sinusoidalDrift(elapsedMs, { xAmp: 240, xFreq: 0.18, yBase: 60, yAmp: 70, yFreq: 0.12, z: 640 })
  }

  protected disposeScene(): void {
    this.clouds = []
    this.trees = []
    this.birds = []
    this.sun = null
  }

  // ---- terrain ----

  private height(x: number, z: number): number {
    return (
      Math.sin(x * 0.00045) * 150 +
      Math.cos(z * 0.0006) * 120 +
      Math.sin(x * 0.0011 + z * 0.0007) * 95 +
      Math.cos(x * 0.0023 - z * 0.0019) * 40
    )
  }

  private addTerrain(): void {
    const size = 46000
    const seg = 200
    const geo = new THREE.PlaneGeometry(size, size, seg, seg)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors: number[] = []
    const low = new THREE.Color(0x47602c)
    const high = new THREE.Color(0x7d9447)
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i) + this.terrainCenterZ
      const h = this.height(x, z)
      pos.setY(i, h)
      const tnorm = THREE.MathUtils.clamp((h + 250) / 500, 0, 1)
      c.copy(low).lerp(high, tnorm)
      // subtle per-vertex variation
      const v = 0.92 + ((Math.sin(x * 0.05) * Math.cos(z * 0.05) + 1) / 2) * 0.16
      colors.push(c.r * v, c.g * v, c.b * v)
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
    )
    mesh.position.set(0, this.groundY, this.terrainCenterZ)
    mesh.receiveShadow = true
    this.groundGroup.add(mesh)
  }

  // ---- vegetation ----

  private addTrees(): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 })
    const foliageMats = [0x2c5230, 0x35603a, 0x274a2c].map(
      (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 })
    )
    for (let i = 0; i < 46; i++) {
      const x = (Math.random() - 0.5) * 17000
      const z = -2600 - Math.random() * 8500
      const y = this.groundY + this.height(x, z)
      const scale = 0.8 + Math.random() * 1.0
      const g = new THREE.Group()
      const h = 360 * scale

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(10 * scale, 18 * scale, h * 0.4, 6),
        trunkMat
      )
      trunk.position.y = h * 0.2
      trunk.castShadow = true
      g.add(trunk)

      const mat = foliageMats[i % foliageMats.length]
      for (let tier = 0; tier < 3; tier++) {
        const tierH = h * (0.42 - tier * 0.08)
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry((h * 0.34) * (1 - tier * 0.22), tierH, 8),
          mat
        )
        cone.position.y = h * (0.34 + tier * 0.2)
        cone.castShadow = true
        g.add(cone)
      }

      g.position.set(x, y, z)
      this.trees.push({ mesh: g, phase: Math.random() * 6.28, amp: 0.012 + Math.random() * 0.018 })
      this.groundGroup.add(g)
    }
  }

  private addRocks(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8579, roughness: 1, flatShading: true })
    for (let i = 0; i < 20; i++) {
      const x = (Math.random() - 0.5) * 14000
      const z = -1600 - Math.random() * 7000
      const y = this.groundY + this.height(x, z)
      const s = 60 + Math.random() * 160
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat)
      rock.scale.set(1, 0.6 + Math.random() * 0.3, 1)
      rock.rotation.set(Math.random(), Math.random() * 6.28, Math.random())
      rock.position.set(x, y + s * 0.25, z)
      rock.castShadow = true
      rock.receiveShadow = true
      this.groundGroup.add(rock)
    }
  }

  private addShrubs(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3c5e2e, roughness: 1, flatShading: true })
    for (let i = 0; i < 40; i++) {
      const x = (Math.random() - 0.5) * 13000
      const z = -1200 - Math.random() * 6000
      const y = this.groundY + this.height(x, z)
      const s = 50 + Math.random() * 90
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat)
      bush.scale.set(1, 0.8, 1)
      bush.position.set(x, y + s * 0.5, z)
      bush.castShadow = true
      this.groundGroup.add(bush)
    }
  }

  // ---- sky elements ----

  private addClouds(): void {
    const tex = this.makeCloud()
    for (let i = 0; i < 11; i++) {
      const w = 1800 + Math.random() * 2400
      const cloud = new THREE.Mesh(
        new THREE.PlaneGeometry(w, w * 0.5),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.55 + Math.random() * 0.35,
          depthWrite: false,
          fog: true
        })
      )
      cloud.position.set(
        -8000 + Math.random() * 16000,
        900 + Math.random() * 1500,
        -5000 - Math.random() * 7000
      )
      this.clouds.push({ mesh: cloud, speed: 12 + Math.random() * 22 })
      this.root.add(cloud)
    }
  }

  private addBirds(): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0x2b2b33, fog: true })
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group()
      const wingGeo = new THREE.PlaneGeometry(150, 26)
      const left = new THREE.Group()
      const right = new THREE.Group()
      const lm = new THREE.Mesh(wingGeo, mat)
      lm.position.x = -75
      left.add(lm)
      const rm = new THREE.Mesh(wingGeo, mat)
      rm.position.x = 75
      right.add(rm)
      g.add(left)
      g.add(right)
      g.position.set(
        -9000 + Math.random() * 18000,
        1400 + Math.random() * 1400,
        -3500 - Math.random() * 4000
      )
      const s = 0.7 + Math.random() * 0.8
      g.scale.setScalar(s)
      this.birds.push({ mesh: g, phase: Math.random() * 6.28, wings: [left, right] })
      this.root.add(g)
    }
  }

  // ---- builders for ridges + textures ----

  private addRidge(z: number, height: number, color: number, snow = false): void {
    const halfW = 30000
    const shape = new THREE.Shape()
    shape.moveTo(-halfW, -4000)
    const steps = 80
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= steps; i++) {
      const x = -halfW + (i / steps) * (halfW * 2)
      const n =
        Math.sin(i * 0.7) * 0.3 + Math.sin(i * 0.23 + 1.3) * 0.5 + Math.sin(i * 1.9 + 0.5) * 0.2
      const yy = height * (0.4 + 0.6 * (0.5 + 0.5 * n))
      pts.push(new THREE.Vector2(x, yy))
      shape.lineTo(x, yy)
    }
    shape.lineTo(halfW, -4000)
    shape.closePath()
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color, fog: true })
    )
    mesh.position.set(0, this.groundY, z)
    this.groundGroup.add(mesh)

    if (snow) {
      // A lighter cap band tracing the upper ridge silhouette.
      const capShape = new THREE.Shape()
      capShape.moveTo(pts[0].x, pts[0].y)
      for (const p of pts) capShape.lineTo(p.x, p.y)
      for (let i = pts.length - 1; i >= 0; i--) {
        capShape.lineTo(pts[i].x, pts[i].y - 120)
      }
      capShape.closePath()
      const cap = new THREE.Mesh(
        new THREE.ShapeGeometry(capShape),
        new THREE.MeshBasicMaterial({ color: 0xeef3fb, fog: true })
      )
      cap.position.set(0, this.groundY, z + 5)
      this.groundGroup.add(cap)
    }
  }

  /** Vertical sky gradient (deep blue zenith → warm golden-hour horizon). */
  private makeSky(): THREE.Texture {
    return canvasTexture(16, 256, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#244a86')
      grad.addColorStop(0.32, '#5a7fb2')
      grad.addColorStop(0.52, '#9fb4cc')
      grad.addColorStop(0.62, '#f3c489')
      grad.addColorStop(0.78, '#f0a460')
      grad.addColorStop(1, '#e58a4e')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
    })
  }

  /** Warm radial glow for the low sun disc (scene-specific colour, so painted
   *  directly rather than via the shared white makeGlow). */
  private makeGlow(): THREE.Texture {
    return canvasTexture(128, 128, (ctx, w) => {
      const r = w / 2
      const g = ctx.createRadialGradient(r, r, 0, r, r, r)
      g.addColorStop(0, 'rgba(255,250,228,1)')
      g.addColorStop(0.25, 'rgba(255,230,176,0.95)')
      g.addColorStop(1, 'rgba(255,210,150,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, w)
    })
  }

  /** Soft puffy cloud sprite from clustered translucent blobs. */
  private makeCloud(): THREE.Texture {
    return canvasTexture(256, 128, (ctx) => {
      for (let i = 0; i < 30; i++) {
        const x = 40 + Math.random() * 176
        const y = 55 + Math.random() * 38
        const r = 24 + Math.random() * 40
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, 'rgba(255,255,255,0.55)')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    })
  }
}
