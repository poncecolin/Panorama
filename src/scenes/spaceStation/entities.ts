import * as THREE from 'three'
import { easeInOut } from '../lib/math'

/**
 * A ship cruising between two points (a dock berth and open space, or two open
 * points for crossing traffic). It eases back and forth along the segment and
 * keeps its nose (-Z) pointed along the direction of travel.
 */
export class Ship {
  group: THREE.Group
  /** Normalized progress along the path [0,1); seeded randomly so the fleet is
   *  desynchronized. */
  t = 0
  private a = new THREE.Vector3()
  private b = new THREE.Vector3()
  private speed = 0.02
  private tmp = new THREE.Vector3()

  constructor(group: THREE.Group) {
    this.group = group
  }

  setPath(a: THREE.Vector3, b: THREE.Vector3, speed: number): void {
    this.a.copy(a)
    this.b.copy(b)
    this.speed = speed
  }

  update(dt: number): void {
    this.t += dt * this.speed
    if (this.t >= 1) this.t -= 1
    const p = easeInOut(this.t)
    this.group.position.lerpVectors(this.a, this.b, p)
    // orient nose (-Z) toward travel direction by looking slightly ahead
    this.tmp.lerpVectors(this.a, this.b, Math.min(1, p + 0.02))
    this.group.lookAt(this.tmp)
  }
}

/**
 * A hyperspace traveller tied to the jump gate. Over a repeating `cycle` it
 * either cruises in and jumps out in a bright streak (inbound) or bursts out of
 * the gate and cruises away (outbound). The streak is a thin cylinder along the
 * travel axis whose opacity/length spike during the jump flash.
 */
export class Jumper {
  group: THREE.Group
  private streak: THREE.Mesh
  private ship: THREE.Object3D
  private gate: THREE.Vector3
  private start = new THREE.Vector3()
  private look = new THREE.Vector3()
  private t = 0
  private cycle: number
  private outbound: boolean

  constructor(
    group: THREE.Group,
    ship: THREE.Object3D,
    streak: THREE.Mesh,
    gate: THREE.Vector3,
    outbound: boolean,
    cycle: number,
    phase: number
  ) {
    this.group = group
    this.ship = ship
    this.streak = streak
    this.gate = gate
    this.outbound = outbound
    this.cycle = cycle
    this.t = phase * cycle
    this.start.set(
      gate.x + (Math.random() - 0.5) * 10000,
      gate.y + (Math.random() - 0.5) * 5000,
      gate.z + 8000 + Math.random() * 7000
    )
  }

  /** Drive the jump flash: `jf` in [0,1] peaks the streak mid-jump. */
  private flash(jf: number): void {
    const mat = this.streak.material as THREE.MeshBasicMaterial
    mat.opacity = Math.sin(jf * Math.PI) * 0.95
    this.streak.scale.set(1, 1, 1 + jf * 34)
  }

  private clear(): void {
    ;(this.streak.material as THREE.MeshBasicMaterial).opacity = 0
    this.streak.scale.set(1, 1, 1)
  }

  update(dt: number): void {
    this.t += dt
    if (this.t > this.cycle) this.t -= this.cycle
    const f = this.t / this.cycle

    if (!this.outbound) {
      // Inbound: cruise in, then jump to hyperspace in a streak and vanish.
      if (f < 0.72) {
        const p = easeInOut(f / 0.72)
        this.group.position.lerpVectors(this.start, this.gate, p)
        this.group.lookAt(this.gate)
        this.ship.visible = true
        this.clear()
      } else if (f < 0.84) {
        const jf = (f - 0.72) / 0.12
        this.group.position.copy(this.gate)
        this.look.subVectors(this.gate, this.start).add(this.gate)
        this.group.lookAt(this.look)
        this.ship.visible = jf < 0.4
        this.flash(jf)
      } else {
        this.ship.visible = false
        this.clear()
      }
    } else {
      // Arrival: a streak bursts from the gate, then a ship drops out and cruises away.
      if (f < 0.12) {
        const jf = f / 0.12
        this.group.position.copy(this.gate)
        this.group.lookAt(this.start)
        this.ship.visible = jf > 0.6
        this.flash(1 - jf)
      } else if (f < 0.86) {
        const p = easeInOut((f - 0.12) / 0.74)
        this.group.position.lerpVectors(this.gate, this.start, p)
        this.group.lookAt(this.start)
        this.ship.visible = true
        this.clear()
      } else {
        this.ship.visible = false
        this.clear()
      }
    }
  }
}
