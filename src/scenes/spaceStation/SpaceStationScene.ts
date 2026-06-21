import * as THREE from 'three'
import { SceneEnv, AttractSample } from '../types'
import { SceneBase } from '../lib/SceneBase'
import { makeGlow, tile } from '../lib/textures'
import { sinusoidalDrift } from '../lib/drift'
import { Ship, Jumper } from './entities'
import { makeShip, makeWindowTexture, makePlanetTexture, makeGatePortal, makeNebula } from './factories'

/**
 * Sci-fi hero scene: the view out a residential-port window of a huge space
 * station. A habitat wheel and docking spindle sit close (strong parallax →
 * sense of scale); ships of many sizes come and go from the docks; a skeletal
 * dry-dock with cranes and lit office/habitat blocks recede behind; a hyperspace
 * jump gate further back swallows and disgorges ships in brilliant streaks; and
 * an Earth-like planet hangs far to the side. Fully procedural (no assets).
 *
 * Coordinate frame: millimetres, window at z=0, space at -z. The big magic
 * numbers below are mm positions/sizes (e.g. the planet sits ~85 m "behind" the
 * glass and is ~5 m across) — distances are large so elements fit the narrow
 * (~26°) window FOV without overwhelming the frame.
 *
 * Space has no ground, so the window-height knob does not apply (no
 * setWindowHeightMm).
 */
export class SpaceStationScene extends SceneBase {
  id = 'space'
  label = 'Space station'

  private ships: Ship[] = []
  private jumpers: Jumper[] = []
  private planet: THREE.Object3D | null = null
  private ring: THREE.Object3D | null = null
  private gateCore: THREE.Mesh | null = null
  private beacons: { mesh: THREE.Mesh; phase: number; base: number }[] = []

  private glowTex!: THREE.Texture
  private winBase!: THREE.Texture
  private readonly stationPos = new THREE.Vector3(-3500, -2300, 0)
  private readonly gate = new THREE.Vector3(1800, 500, -32000)

  protected buildScene(env: SceneEnv): void {
    const { scene } = env
    scene.background = new THREE.Color(0x04050a)
    this.glowTex = makeGlow()
    this.winBase = makeWindowTexture(8, 8, 0.5) // small + tileable; repeated per surface

    // ---- lighting: a distant star + faint fill so hulls read in the dark ----
    scene.add(new THREE.AmbientLight(0x223044, 0.5))
    const star = new THREE.DirectionalLight(0xfff4e0, 2.1)
    star.position.set(11000, 7000, 6000)
    scene.add(star)
    const rim = new THREE.DirectionalLight(0x4a7bd0, 0.5)
    rim.position.set(-8000, -2000, 1000)
    scene.add(rim)

    this.addStarfield()
    this.addNebula()
    this.addPlanet()
    this.addStation()
    this.addDryDock()
    this.addOfficeBlocks()
    this.addJumpGate()
    this.addJumpers()
    this.addShips()
  }

  update(dtMs: number, elapsedMs: number): void {
    const dt = dtMs / 1000
    const t = elapsedMs / 1000

    if (this.planet) this.planet.rotation.y += dt * 0.012
    if (this.ring) this.ring.rotation.z += dt * 0.06
    if (this.gateCore) {
      const s = 1 + Math.sin(t * 1.5) * 0.04
      this.gateCore.scale.set(s, s, 1)
      ;(this.gateCore.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(t * 2.3) * 0.15
    }
    for (const b of this.beacons) {
      const lit = 0.5 + 0.5 * Math.sin(t * 4 + b.phase)
      ;(b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.25 + lit * 0.75
    }
    for (const s of this.ships) s.update(dt)
    for (const j of this.jumpers) j.update(dt)
  }

  attractEye(elapsedMs: number): AttractSample {
    return sinusoidalDrift(elapsedMs, { xAmp: 170, xFreq: 0.16, yBase: 40, yAmp: 55, yFreq: 0.11, z: 650 })
  }

  protected disposeScene(): void {
    this.ships = []
    this.jumpers = []
    this.beacons = []
    this.planet = null
    this.ring = null
    this.gateCore = null
  }

  // ---------- builders ----------

  private addStarfield(): void {
    const n = 2600
    const pos: number[] = []
    const col: number[] = []
    const c = new THREE.Color()
    for (let i = 0; i < n; i++) {
      // points on a far shell
      const r = 60000 + Math.random() * 30000
      const u = Math.random() * 2 - 1
      const th = Math.random() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      // bias toward the front hemisphere (-z) so most are visible
      const z = -Math.abs(u) * r - 8000
      pos.push(s * Math.cos(th) * r, s * Math.sin(th) * r * 0.6, z)
      const tint = Math.random()
      c.setHSL(0.6 - tint * 0.1, 0.3, 0.6 + Math.random() * 0.4)
      col.push(c.r, c.g, c.b)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true })
    )
    this.root.add(stars)
  }

  private addNebula(): void {
    const tex = makeNebula()
    const neb = new THREE.Mesh(
      new THREE.PlaneGeometry(90000, 50000),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    )
    neb.position.set(4000, 3000, -75000)
    this.root.add(neb)
  }

  private addPlanet(): void {
    const g = new THREE.Group()
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(5200, 64, 48),
      new THREE.MeshStandardMaterial({
        map: makePlanetTexture(),
        roughness: 1,
        metalness: 0,
        emissive: 0x16365e,
        emissiveIntensity: 0.5
      })
    )
    g.add(planet)
    // atmosphere rim
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(5520, 48, 32),
      new THREE.MeshBasicMaterial({
        color: 0x6fb6ff,
        transparent: true,
        opacity: 0.18,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    g.add(atmo)
    g.position.set(15000, 12000, -85000)
    g.rotation.z = 0.3
    this.planet = planet
    this.root.add(g)
  }

  private addStation(): void {
    const station = new THREE.Group()
    station.position.copy(this.stationPos)

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x6b7785, roughness: 0.6, metalness: 0.6 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a414c, roughness: 0.8, metalness: 0.5 })

    // Central docking spindle (axis along z).
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(700, 700, 9000, 24, 1, true), hullMat)
    spindle.rotation.x = Math.PI / 2
    spindle.position.set(0, 0, -7000)
    station.add(spindle)
    // window band on the spindle
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(710, 710, 9000, 24, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x20262e,
        emissive: 0xffffff,
        emissiveMap: tile(this.winBase, 16, 9),
        emissiveIntensity: 1.1,
        roughness: 1,
        side: THREE.DoubleSide
      })
    )
    band.rotation.x = Math.PI / 2
    band.position.copy(spindle.position)
    station.add(band)

    // Rotating residential habitat wheel.
    const ring = new THREE.Group()
    const torus = new THREE.Mesh(new THREE.TorusGeometry(3300, 460, 20, 64), new THREE.MeshStandardMaterial({
      color: 0x222932,
      emissive: 0xffffff,
      emissiveMap: tile(this.winBase, 64, 4),
      emissiveIntensity: 1.0,
      roughness: 1,
      metalness: 0.2
    }))
    ring.add(torus)
    // spokes
    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(180, 3300, 180), darkMat)
      spoke.rotation.z = (i / 6) * Math.PI * 2
      ring.add(spoke)
    }
    ring.position.set(0, 0, -6200)
    station.add(ring)
    this.ring = ring

    // Docking arms reaching out from the spindle, where ships berth.
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2
      const arm = new THREE.Mesh(new THREE.BoxGeometry(220, 220, 1600), hullMat)
      const ax = Math.cos(ang) * 1500
      const ay = Math.sin(ang) * 1500
      arm.position.set(ax, ay, -4200)
      arm.lookAt(0, 0, -4200)
      station.add(arm)
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(360, 360, 80, 12), darkMat)
      pad.rotation.x = Math.PI / 2
      pad.position.set(ax * 1.3, ay * 1.3, -3500)
      station.add(pad)
      // berth beacon
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(40, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true })
      )
      beacon.position.set(ax * 1.3, ay * 1.3, -3440)
      this.beacons.push({ mesh: beacon, phase: i, base: 0.5 })
      station.add(beacon)
    }

    // Solar panels for scale.
    for (const sgn of [-1, 1]) {
      const truss = new THREE.Mesh(new THREE.BoxGeometry(60, 60, 4200), darkMat)
      truss.position.set(sgn * 2600, 1800, -7000)
      station.add(truss)
      for (let k = -1; k <= 1; k++) {
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(2200, 30, 1100),
          new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.4, metalness: 0.3, emissive: 0x10204a, emissiveIntensity: 0.3 })
        )
        panel.position.set(sgn * (2600 + 1300), 1800, -7000 + k * 1300)
        station.add(panel)
      }
    }

    this.root.add(station)
  }

  private addDryDock(): void {
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.8, metalness: 0.5 })
    const dock = new THREE.Group()
    dock.position.set(-700, -2200, -13500)

    // open box frame from thin beams
    const W = 3600
    const H = 2600
    const D = 5200
    const edges: [number, number, number, number, number, number][] = [
      [W, 80, 80, 0, H / 2, 0], [W, 80, 80, 0, -H / 2, 0],
      [W, 80, 80, 0, H / 2, -D], [W, 80, 80, 0, -H / 2, -D],
      [80, H, 80, W / 2, 0, 0], [80, H, 80, -W / 2, 0, 0],
      [80, H, 80, W / 2, 0, -D], [80, H, 80, -W / 2, 0, -D],
      [80, 80, D, W / 2, H / 2, -D / 2], [80, 80, D, -W / 2, H / 2, -D / 2],
      [80, 80, D, W / 2, -H / 2, -D / 2], [80, 80, D, -W / 2, -H / 2, -D / 2]
    ]
    for (const [sx, sy, sz, px, py, pz] of edges) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), beamMat)
      beam.position.set(px, py, pz)
      dock.add(beam)
    }
    // ship under construction inside (dark, partial)
    const wip = new THREE.Mesh(new THREE.CylinderGeometry(700, 500, 3800, 12), new THREE.MeshStandardMaterial({ color: 0x2c333c, roughness: 1, metalness: 0.4 }))
    wip.rotation.x = Math.PI / 2
    wip.position.set(0, -200, -D / 2)
    dock.add(wip)
    // crane arms
    for (let i = 0; i < 3; i++) {
      const crane = new THREE.Group()
      const post = new THREE.Mesh(new THREE.BoxGeometry(70, 1600, 70), beamMat)
      post.position.y = 800
      crane.add(post)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1500, 60, 60), beamMat)
      arm.position.set(600, 1500, 0)
      crane.add(arm)
      const cable = new THREE.Mesh(new THREE.BoxGeometry(16, 700, 16), beamMat)
      cable.position.set(1250, 1100, 0)
      crane.add(cable)
      crane.position.set(-W / 2 + 300 + i * 1300, H / 2, -800 - i * 1500)
      dock.add(crane)
    }
    this.root.add(dock)
  }

  private addOfficeBlocks(): void {
    for (let i = 0; i < 10; i++) {
      const w = 1200 + Math.random() * 2200
      const h = 1400 + Math.random() * 2600
      const d = 1000 + Math.random() * 1600
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({
          color: 0x2a313b,
          emissive: 0xffffff,
          emissiveMap: tile(this.winBase, Math.max(2, Math.round(w / 650)), Math.max(2, Math.round(h / 650))),
          emissiveIntensity: 0.9,
          roughness: 0.9,
          metalness: 0.4
        })
      )
      block.position.set(
        5000 + Math.random() * 8000,
        -2500 + Math.random() * 4500,
        -17000 - Math.random() * 8000
      )
      this.root.add(block)
    }
  }

  private addJumpGate(): void {
    const gate = new THREE.Group()
    gate.position.copy(this.gate)

    const ringMat = new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 0.5, metalness: 0.8, emissive: 0x113355, emissiveIntensity: 0.4 })
    const torus = new THREE.Mesh(new THREE.TorusGeometry(3000, 280, 16, 64), ringMat)
    gate.add(torus)
    // pylons
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const p = new THREE.Mesh(new THREE.BoxGeometry(160, 160, 700), ringMat)
      p.position.set(Math.cos(a) * 3300, Math.sin(a) * 3300, 0)
      gate.add(p)
    }
    // glowing event-horizon core
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(2850, 48),
      new THREE.MeshBasicMaterial({ map: makeGatePortal(), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    )
    gate.add(core)
    this.gateCore = core
    this.root.add(gate)
  }

  private addShips(): void {
    // Dock berths (world space) near the station spindle where ships berth.
    const sp = this.stationPos
    const berths = [
      sp.clone().add(new THREE.Vector3(1400, 900, -3300)),
      sp.clone().add(new THREE.Vector3(-1000, -700, -3900)),
      sp.clone().add(new THREE.Vector3(900, -1300, -4400)),
      sp.clone().add(new THREE.Vector3(2000, 200, -3000))
    ]
    const open = () =>
      new THREE.Vector3(-3000 + Math.random() * 13000, -2000 + Math.random() * 6500, -8000 - Math.random() * 9000)

    for (let i = 0; i < 16; i++) {
      const scale = 0.4 + Math.random() * 1.6
      const ship = new Ship(makeShip(scale, this.glowTex))
      const berth = berths[i % berths.length]
      const r = Math.random()
      if (r < 0.45) {
        // arrival: open space -> berth
        ship.setPath(open(), berth.clone(), 0.02 + Math.random() * 0.03)
      } else if (r < 0.8) {
        // departure: berth -> open / toward gate
        const dest = Math.random() < 0.5 ? open() : this.gate.clone().add(new THREE.Vector3(0, 0, 2500))
        ship.setPath(berth.clone(), dest, 0.02 + Math.random() * 0.03)
      } else {
        // crossing traffic
        ship.setPath(open(), open(), 0.015 + Math.random() * 0.025)
      }
      ship.t = Math.random()
      this.ships.push(ship)
      this.root.add(ship.group)
    }
  }

  private addJumpers(): void {
    for (let i = 0; i < 6; i++) {
      const scale = 0.5 + Math.random() * 1.3
      const group = new THREE.Group()
      const ship = makeShip(scale, this.glowTex)
      group.add(ship)
      const streak = new THREE.Mesh(
        new THREE.CylinderGeometry(16, 16, 420, 8),
        new THREE.MeshBasicMaterial({
          color: 0xcdeeff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      )
      streak.rotation.x = Math.PI / 2 // length along local Z (travel axis)
      group.add(streak)
      const outbound = i % 2 === 0
      const cycle = 7 + Math.random() * 6
      this.jumpers.push(new Jumper(group, ship, streak, this.gate, outbound, cycle, Math.random()))
      this.root.add(group)
    }
  }
}
