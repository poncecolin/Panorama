# Panorama

**Turn a screen into a simulated glass window.**

Panorama uses your laptop's camera to track your eyes in 3D and renders an animated scene
through an **off-axis (asymmetric-frustum) projection**, so the view shifts with your
position exactly like looking through real glass. Stand to the left and you see more of
what's on the right; lean in and the scene opens up; crouch and you look up into it. This
is the classic "fish-tank VR" effect, with no headset — just the built-in webcam.

> **Status:** Phase 1 (standalone laptop, built-in camera) is complete and validated
> on-device. Phase 2 (external TV over HDMI) and Phase 3 (alternative renderer/engine) are
> designed but not yet built. See [`docs/STATUS.md`](docs/STATUS.md) for the living status,
> known limitations, and roadmap.

## How it works

```
camera → ViewerTracker → GeometrySolver → SceneRenderer → screen   (wired by PanoramaEngine)
```

1. **`ViewerTracker`** — emits the viewer's eye position from the camera. The current impl
   (`MediaPipeFaceTracker`) uses MediaPipe Face Landmarker. The viewpoint comes from
   **blink-stable eye-corner midpoints**, with head yaw and a blink/yaw **confidence** read
   from the face transformation matrix and blendshapes.
2. **`GeometrySolver`** — pure, unit-tested window math: depth from inter-pupillary distance
   (cos(yaw)-corrected so a turned head isn't read as farther away), confidence-gated
   One Euro smoothing that holds the last good eye through blinks, and the Kooima off-axis
   projection matrix.
3. **`SceneRenderer`** — drives an off-axis camera (camera *position* = your eye). The
   current impl (`ThreeRenderer`) is built on Three.js.
4. **`ThreeScene`** — the scene content. Scenes are procedural (no asset licensing).
   Current scenes: `landscape`, `space` (sci-fi station), `test` (depth boxes).

The **tracker**, the **renderer/engine**, and the **scene content** are each replaceable
behind a clean interface — modularity is the project's core constraint. A full architecture
walkthrough lives in [`CLAUDE.md`](CLAUDE.md).

### Tracking robustness

The illusion breaks the moment tracking gets jittery, so the pipeline is hardened against
the common failure modes: blinks are held through invisibly, turning past ~45° stays steady
(via cos(yaw) depth correction and a real per-sample confidence gate), and re-acquiring the
viewer after a loss glides rather than snaps.

## Getting started

Requires **Node.js** and **npm**.

```bash
npm install
npm run dev          # launch the Electron app (full pipeline incl. camera)
```

All camera processing is **local** — no frames are recorded or uploaded.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Electron app, full pipeline including the camera (electron-vite dev) |
| `npm run dev:web` | Browser-only UI on port 5180 — camera is blocked, shows attract mode |
| `npm run build` | Build to `out/` |
| `npm test` | Run the unit-test suite (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | Type-check both the node and web tsconfigs |

### Self-test harnesses (no webcam needed)

Because a headless browser blocks camera access, rendering and geometry are verified
deterministically via query params on the renderer URL (works under `npm run dev:web`):

- `?selftest=render&scene=<id>` — render a scene at a **fixed** eye; call
  `window.panoramaSetEye(x, y, z)` from the console to move the eye and inspect parallax.
- `?selftest=tracker` — MediaPipe init check.
- `?selftest=track-live` — full pipeline driven by a synthetic camera.

## Adding a scene

Extend `SceneBase` ([`src/scenes/lib/SceneBase.ts`](src/scenes/lib/SceneBase.ts)) — it owns
the `root` group and the build/dispose wiring, so you implement `buildScene`, `update`, and
optionally `attractEye` / `setWindowHeightMm` — then register it in
[`src/scenes/registry.ts`](src/scenes/registry.ts). Reuse the shared helpers in
`src/scenes/lib/` (`textures.ts`, `drift.ts`, `math.ts`) rather than re-rolling
canvas/texture boilerplate. The rest of the app is scene-agnostic.

## Conventions

- **Coordinates:** screen space is **millimetres**, origin at screen center, +X right,
  +Y up, +Z toward the viewer. Scenes live behind the glass at **negative Z**.
- **Dev panels:** toggle with **D** — Camera, Pose, Perf, and Tuning (live sliders for all
  tuning params). A 5-step calibration wizard sets screen size, IPD, and optionally FOV.

## Layout

```
src/main        Electron main (window/display, fullscreen)
src/preload     preload bridge
src/renderer    React UI, engine, dev panels, settings
src/core        tracker / geometry / render (the three swappable boundaries)
src/scenes      scene content; lib/ = SceneBase + shared helpers
src/shared      types, settings, calibration, IPC
config          shared import aliases
docs/STATUS.md  living status doc
```

## License

MIT
