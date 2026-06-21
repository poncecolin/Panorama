# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Panorama is

Panorama turns a screen into a simulated glass **window**. The laptop camera tracks the
viewer's eyes in 3D, and an animated scene is rendered through an **off-axis
(asymmetric-frustum) projection** so the view shifts with the viewer's position, exactly
like looking through real glass ("fish-tank VR"). Phase 1 (a standalone laptop with its
built-in camera) is complete and on-device validated. Phase 2 (external TV over HDMI) has
its **foundation built** — calibration profiles, dual-window surfaces, cross-window IPC,
and a probe-based TV calibration wizard — pending on-device validation on a real TV.
Phase 3 (alternative renderer/engine) is designed but not built.

`docs/STATUS.md` is the living status doc — read it for current state, known bugs, and the
Phase 2/3 roadmap, and keep it updated as work lands.

## Environment gotchas (Windows)

- **Node is not on PATH** in the Bash/PowerShell tools. Prefix commands with:
  `$env:Path = "C:\Program Files\nodejs;" + $env:Path`
- The **Electron binary** was extracted manually into `node_modules/electron/dist` (the
  postinstall download failed here). Don't assume `npm install` re-provisions it.
- `npm run package` (electron-builder portable exe) **fails on this machine** — winCodeSign
  symlink extraction needs Windows Developer Mode/elevation. Use `Panorama.cmd` to launch
  the built app instead.

## Commands

```bash
npm run dev          # Electron app (full pipeline incl. camera) — electron-vite dev
npm run dev:web      # Browser-only UI on port 5180 — camera is blocked, shows attract mode
npm run build        # electron-vite build → out/  (rebuild before launching via Panorama.cmd)
npm test             # vitest run (all unit tests)
npm run test:watch   # vitest watch
npm run typecheck    # tsc for both node + web tsconfigs
```

- **Run a single test:** `npx vitest run src/core/geometry/GeometrySolver.test.ts`
  (or `-t "<test name>"` to filter by name).
- **Launcher:** double-click `Panorama.cmd` (builds once if needed, then runs the *built*
  app from `out/` — so rebuild after changes) or `Panorama.vbs` for a console-free start.

## Self-test harnesses (no webcam needed)

Append a query param to the renderer URL (works in `dev:web`). These are the primary way to
verify rendering/geometry deterministically, since the headless preview blocks `getUserMedia`:

- `?selftest=render&scene=<id>` — renders a scene at a **fixed** eye. Call
  `window.panoramaSetEye(x,y,z)` from the console to move the eye and screenshot parallax.
  Prefer this over attract mode, which drifts. (`src/renderer/src/dev/RenderSelfTest.tsx`)
- `?selftest=tracker` — MediaPipe init check.
- `?selftest=track-live` — full pipeline driven by a synthetic camera (canvas stream).

## Architecture — the three swappable boundaries

Modularity is the overarching constraint: the **tracker**, the **renderer/engine**, and the
**scene content** must each be replaceable without an app rewrite. Each lives behind an
interface. The pipeline:

```
camera → ViewerTracker → GeometrySolver → SceneRenderer → screen   (wired by PanoramaEngine)
```

1. **`ViewerTracker`** (`src/core/tracker/`) — emits eye samples from the camera. Impl:
   `MediaPipeFaceTracker`. The viewpoint comes from **blink-stable eye-corner midpoints**
   (not the iris — it's occluded by blinks and degrades first under yaw); head yaw and a
   blink/yaw **confidence** are read from the transformation matrix + blendshapes. Pure,
   testable math lives in `faceGeometry.ts`. `firstPersonLock.ts` keeps the *originally*
   locked viewer when other faces appear. A `getStream` injection seam lets tests/self-tests
   supply a synthetic camera. A pose-based tracker can be added here for Phase 2 distances.
2. **`GeometrySolver`** (`src/core/geometry/`) — pure, unit-tested window math. Depth from
   IPD (`depth = focalNorm · ipd / interEyeNorm`), **cos(yaw)-corrected** so a turned head
   isn't read as farther away; camera→screen placement transform; **confidence-gated** One
   Euro smoothing (`oneEuro.ts`) that holds the last good eye through blinks/outliers; and
   the Kooima off-axis projection matrix (`projection.ts`). `dolly.ts` is the separate
   "dive-in" effect (see below).
3. **`SceneRenderer`** (`src/core/render/`) — Impl: `ThreeRenderer` (Three.js). Drives an
   off-axis camera: camera *position* = eye, identity rotation, projection set from the
   solver's matrix. Shadow mapping enabled. A pixel-streamed/native engine could replace it.
4. **`ThreeScene`** (`src/scenes/`) — scene content. **To add a scene:** extend
   `SceneBase` (`src/scenes/lib/SceneBase.ts`) — it owns the `root` group and the
   build/dispose wiring, so you implement `buildScene`, `update`, and optionally
   `attractEye`/`setWindowHeightMm` — then register it in `src/scenes/registry.ts`
   (`SCENES` array + `createScene(id)`). Reuse the shared `src/scenes/lib/` helpers
   (`textures.ts` `canvasTexture`/`makeGlow`/`tile`, `drift.ts` `sinusoidalDrift`,
   `math.ts` `easeInOut`) rather than re-rolling canvas/texture boilerplate. The rest of
   the app is scene-agnostic. Current scenes: `landscape`, `space` (sci-fi station),
   `test` (depth boxes).

`PanoramaEngine` (`src/renderer/src/engine/`) ties the pipeline together and applies the
**tracking lifecycle** (`lifecycle.ts`, unit-tested): a single eased blend between the tracked
eye and a cinematic attract drift. On a brief loss (viewer turns away), it **holds the last
view for 20 s** (`DEFAULT_LIFECYCLE.holdMs`) before gliding to attract, so natural head turns
aren't jarring.

## Key conventions & non-obvious decisions

- **Coordinates:** screen space is **millimetres**, origin at screen center, +X right, +Y up,
  +Z toward the viewer. Scenes live behind the glass at **negative Z**.
- **Path aliases:** `@shared`, `@core`, `@scenes`, `@renderer` are defined once in
  `config/aliases.ts` and imported by all three configs (`electron.vite.config.ts`,
  `vite.web.config.ts`, `vitest.config.ts`) so app and test resolution can't drift.
- **MediaPipe runs on the MAIN THREAD, not a worker** — the wasm won't bootstrap in a Vite ESM
  module worker ("ModuleFactory not set"). Worker offload is a future optimization behind the
  same `ViewerTracker` interface. Detection is paced to ~30 fps so it doesn't starve rendering.
- **MediaPipe asset paths** are resolved relative to `document.baseURI` (not `location.origin`)
  so they work under production `file://`. electron-vite sets the renderer base to `./`.
- **"Dive-in" depth (dolly).** A literal window *shrinks* distant objects as you approach; the
  user wanted the opposite (objects loom). So on approach we dolly the scene toward the viewer
  (`dolly.ts`), tunable via `tuning.approachDollyGain` (**default 0 = pure physical window**).
  Off-axis projection is unchanged, so lateral parallax is intact. Known **clamp seam ~16 in**.
- **Window height** (`tuning.windowHeightMm`, `ThreeScene.setWindowHeightMm`) offsets a scene's
  *ground* content vertically (sky stays put) so the scene composes at any mounting height.
  Space-type scenes have no ground and don't implement it.
- **Narrow window FOV (~26°)** means near objects fill the frame — place distant scene elements
  (planet, jump gate) far and small, or they overwhelm the view.
- **Scenes are procedural** (zero asset licensing) but the `ThreeScene` contract allows curated
  asset packs later.
- **Dev panels:** toggle with **D** — Camera, Pose, Perf, Tuning (live sliders for all
  `TuningParams`). Settings/calibration: 5-step wizard sets the `calibrated` flag; pure math in
  `src/shared/calibration.ts`.
- **TV mode (Phase 2).** Settings hold `profiles.{laptop,tv}` (each `CameraPlacement` +
  `ScreenGeometry`) + `activeProfile`; the engine renders through the active profile, and
  legacy single-`placement` saves migrate into `profiles.laptop`. Patches use `SettingsPatch`
  (partial-profile aware). The renderer loads into one of three **surfaces** (`shared/types`
  `Surface`): `solo` (laptop: engine + overlays), `scene` (TV: fullscreen engine only — forced
  by `?surface=scene`), `control` (laptop: wizard + overlays, no engine — derived when the TV
  profile is active). Electron main opens/closes the scene window per mode and relays
  cross-window IPC: `settings:changed` (sync, so fine-tune previews live on the TV),
  `engine:status` (scene→control stream), `scene:command` (drives the `calib` scene). The TV
  **calibration math is pure**: `cameraModel.ts` (shared camera↔screen mapping, used by both the
  solver and the calibrator so they can't drift) + `tvCalibration.ts` (`solvePlacement`,
  damped Gauss–Newton recovering the camera placement from "viewer-as-probe" edge-graze
  observations). The wizard is `settings/TvCalibrationWizard.tsx`; the reference scene is
  `scenes/calib/CalibScene.ts`.

## Layout

`src/main` (Electron main: window/display, dual-window mode, IPC relay) · `src/preload` ·
`src/renderer/src` (React UI, engine, dev panels, settings + TV wizard) ·
`src/core/{tracker,geometry,render}` (geometry incl. `cameraModel.ts`, `tvCalibration.ts`) ·
`src/scenes` (scene content; `lib/` = `SceneBase` + shared helpers; `calib/` = calibration
reference scene) · `src/shared` (types, settings, calibration, IPC) · `config/aliases.ts`
(shared import aliases).
