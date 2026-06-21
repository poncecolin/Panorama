import * as THREE from 'three'
import { canvasTexture } from '../lib/textures'

/**
 * Procedural geometry/texture factories specific to the space-station scene.
 * Generic helpers (canvasTexture, makeGlow, tile) live in `../lib/textures`.
 */

/** A small fighter/freighter: fuselage (nose toward -Z), cockpit, twin nacelles,
 *  wings, and additive engine-glow sprites. `scale` sizes the whole group. */
export function makeShip(scale: number, glowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group()
  const hull = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, roughness: 0.5, metalness: 0.7 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x39414c, roughness: 0.7, metalness: 0.6 })

  // fuselage: nose toward -Z
  const body = new THREE.Mesh(new THREE.CylinderGeometry(34, 60, 320, 10), hull)
  body.rotation.x = -Math.PI / 2
  g.add(body)
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(34, 12, 10), new THREE.MeshStandardMaterial({ color: 0x224a66, roughness: 0.2, metalness: 0.4, emissive: 0x113355, emissiveIntensity: 0.5 }))
  cockpit.position.set(0, 14, -120)
  g.add(cockpit)
  // wings/nacelles
  for (const sgn of [-1, 1]) {
    const nac = new THREE.Mesh(new THREE.BoxGeometry(28, 26, 180), dark)
    nac.position.set(sgn * 70, 0, 40)
    g.add(nac)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(90, 10, 120), hull)
    wing.position.set(sgn * 70, 0, 60)
    g.add(wing)
    // engine glow
    const eng = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x66ccff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    eng.scale.set(140, 140, 1)
    eng.position.set(sgn * 70, 0, 135)
    g.add(eng)
  }
  // central engine
  const eng = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x88ddff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
  eng.scale.set(190, 190, 1)
  eng.position.set(0, 0, 170)
  g.add(eng)

  g.scale.setScalar(scale)
  return g
}

/** Tileable "lit windows" mask: a dark grid with a random fraction (`litProb`)
 *  of cells lit in warm/cool tones. Tiled per surface via `tile()` and used as an
 *  emissive map so hulls and office blocks read as inhabited. */
export function makeWindowTexture(cols: number, rows: number, litProb: number): THREE.Texture {
  const cw = 8
  return canvasTexture(cols * cw, rows * cw, (ctx, w, h) => {
    ctx.fillStyle = '#05070b'
    ctx.fillRect(0, 0, w, h)
    const lights = ['#ffd9a0', '#fff4d8', '#bfe0ff', '#ffe9b0']
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (Math.random() < litProb) {
          ctx.fillStyle = lights[Math.floor(Math.random() * lights.length)]
          ctx.fillRect(x * cw + 1.5, y * cw + 1.5, cw - 3, cw - 3)
        }
      }
    }
  })
}

/** Earth-like planet albedo: blue oceans, green/brown continent blobs, polar caps
 *  and scattered clouds, wrapped on a sphere by the scene. */
export function makePlanetTexture(): THREE.Texture {
  return canvasTexture(512, 256, (ctx) => {
    // ocean
    const grd = ctx.createLinearGradient(0, 0, 0, 256)
    grd.addColorStop(0, '#0a2a6a')
    grd.addColorStop(0.5, '#0d4a8a')
    grd.addColorStop(1, '#0a2a6a')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, 512, 256)
    // continents (green/brown blobs)
    const land = ['#2e6b34', '#3f7a3a', '#6b6a3a', '#5a7a40']
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = land[Math.floor(Math.random() * land.length)]
      const x = Math.random() * 512
      const y = 30 + Math.random() * 196
      ctx.beginPath()
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        const r = 18 + Math.random() * 46
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7)
      }
      ctx.closePath()
      ctx.fill()
    }
    // polar caps
    ctx.fillStyle = 'rgba(240,248,255,0.9)'
    ctx.fillRect(0, 0, 512, 18)
    ctx.fillRect(0, 238, 512, 18)
    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    for (let i = 0; i < 40; i++) {
      ctx.beginPath()
      ctx.ellipse(Math.random() * 512, Math.random() * 256, 20 + Math.random() * 50, 8 + Math.random() * 16, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

/** Glowing jump-gate "event horizon": a bright blue radial disc, used additively
 *  on the gate core. Left in linear space (additive blend). */
export function makeGatePortal(): THREE.Texture {
  return canvasTexture(
    256,
    256,
    (ctx) => {
      const grd = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
      grd.addColorStop(0, 'rgba(220,245,255,0.95)')
      grd.addColorStop(0.35, 'rgba(80,180,255,0.7)')
      grd.addColorStop(0.75, 'rgba(40,80,200,0.35)')
      grd.addColorStop(1, 'rgba(20,30,80,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(128, 128, 128, 0, Math.PI * 2)
      ctx.fill()
    },
    false
  )
}

/** A faint purple/blue nebula wash, drawn as overlapping soft radial blobs and
 *  shown on a far additive plane for depth/colour. Left in linear space. */
export function makeNebula(): THREE.Texture {
  return canvasTexture(
    512,
    256,
    (ctx) => {
      const cols = ['rgba(80,40,140,0.5)', 'rgba(40,90,160,0.45)', 'rgba(140,50,110,0.4)']
      for (let i = 0; i < 18; i++) {
        const x = Math.random() * 512
        const y = Math.random() * 256
        const r = 60 + Math.random() * 160
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r)
        grd.addColorStop(0, cols[i % cols.length])
        grd.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grd
        ctx.fillRect(0, 0, 512, 256)
      }
    },
    false
  )
}
