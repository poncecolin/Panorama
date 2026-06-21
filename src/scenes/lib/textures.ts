import * as THREE from 'three'

/**
 * Shared procedural-texture helpers for scenes. Every Panorama scene is fully
 * procedural (no asset files), so textures are painted into an offscreen 2D
 * canvas and wrapped in a THREE.CanvasTexture. These helpers remove the
 * boilerplate that ritual otherwise repeats in every scene.
 */

/** A 2D drawing callback: paint into `ctx` over a `w`×`h` canvas. */
export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void

/**
 * Paint a canvas with `draw` and return it as a texture. `srgb` (default true)
 * tags the texture as sRGB so colours render as authored under the renderer's
 * sRGB output; pass false for data textures (e.g. tiled emissive masks) that you
 * don't want colour-managed.
 */
export function canvasTexture(w: number, h: number, draw: DrawFn, srgb = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * A soft white radial glow (opaque centre → transparent edge) for engine flares
 * and additive sprite glows. Left in linear space (`srgb = false`) by default
 * because it is typically used with additive blending and a per-material colour
 * tint. (Warm/coloured glows — e.g. a sun disc — are scene-specific; paint those
 * with {@link canvasTexture} directly.)
 */
export function makeGlow(size = 64, srgb = false): THREE.CanvasTexture {
  return canvasTexture(
    size,
    size,
    (ctx, w) => {
      const r = w / 2
      const g = ctx.createRadialGradient(r, r, 0, r, r, r)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.4, 'rgba(255,255,255,0.5)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, w)
    },
    srgb
  )
}

/**
 * Return a tiled clone of a texture (repeat-wrapped `rx`×`ry`). Clones so the
 * source texture can be tiled differently per surface — e.g. one small "lit
 * window" base tiled densely on a hull band and sparsely on an office block.
 */
export function tile(tex: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const t = tex.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.needsUpdate = true
  return t
}
