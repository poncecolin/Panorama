# Panorama — Project Status

_Living document. Update as milestones land. Last updated: 2026-06-20._

Panorama turns a screen into a simulated glass **window**: the laptop camera tracks
the viewer's eyes, and an animated 3D scene is rendered through an off-axis
(asymmetric-frustum) projection so the view changes with the viewer's position —
exactly like looking through real glass.

---

## 1. Current state (what works today)

**Pipeline:** `camera → MediaPipe FaceLandmarker → first-person lock → GeometrySolver
→ off-axis ThreeRenderer → screen`, tied together by `PanoramaEngine`.

| Area | Status | Notes |
|---|---|---|
| App shell (M1) | ✅ Done | Electron + electron-vite + React + TS. Fullscreen, hidden auto-hiding control bar, settings persisted via `electron-store`, dev hotkey. |
| Tracking (M2) | ✅ Done | MediaPipe FaceLandmarker → viewpoint from blink-stable eye-corner midpoints + cos(yaw)-corrected depth + per-sample confidence (see §2). First-person lock keeps the original viewer when others appear (unit-tested). Camera-source seam for testing / future sources. |
| Geometry (M3) | ✅ Done | Pure `GeometrySolver`: depth-from-IPD, camera→screen placement transform, One Euro smoothing, Kooima off-axis projection. 10 unit tests. |
| Renderer (M4) | ✅ Done | `ThreeRenderer` drives an off-axis camera from the eye pose. Lateral parallax + look-around verified. |
| "Dive-in" depth | ✅ Done | Approaching the screen makes objects **loom larger** (see §2). Tunable; verified. |
| Landscape scene (M5) | ✅ Done · polished | Procedural golden-hour valley: **rolling shadowed terrain** (vertex-coloured, shadow-mapped), snow-capped haze ridges, ~46 layered pines (swaying), scattered low-poly rocks & shrubs, drifting clouds, gliding birds, warm sun. Self-contained (no external assets). Runs at full refresh. |
| Lifecycle (M6) | ✅ Done | Eased blend between tracked eye and a cinematic attract drift. On a brief loss (turning away), **holds the last view for 20 s** before gliding to attract — so natural head turns aren't jarring. Re-acquires instantly. Pure logic in `engine/lifecycle.ts` (unit-tested). |
| Dev panels (M7) | ✅ Done | Four tabbed views (toggle with **D**): Camera (feed + landmarks + locked/ignored faces), Pose (eye X/Y/Z, angle, distance, state + top-down/side frustum diagrams), Perf (render/detect fps, latency estimate, hitches, fps sparkline), Tuning (live sliders). |
| Window-height knob | ✅ Done | New tuning slider: how high the window sits above the virtual ground. Low = look straight out (TV at normal height); high = look down over the land (low laptop). Scenes offset their ground content; sky stays put. |
| Calibration + settings UI (M8) | ✅ Done | Friendly 5-step wizard (screen size from diagonal, IPD, optional FOV capture at a measured distance, review/save) + a Settings panel (edit physical setup, audio, recalibrate, reset). Sets a `calibrated` flag. Pure math in `src/shared/calibration.ts` (unit-tested). |
| Space station scene | ✅ Done | Sci-fi hero scene (`spaceStation/SpaceStationScene.ts`): residential-port view of a huge station — rotating habitat wheel with lit windows, docking spindle/arms, ships of varied sizes coming & going (engine glows), skeletal dry-dock with cranes, office/habitat district, a hyperspace **jump gate** with ships streaking in/out, an Earth-like planet, starfield + nebula. Scale reads through parallax. Registered as `space`. |
| Launch | ✅ Done | Double-click **`Panorama.cmd`** (builds once, then launches the built app — no terminal) or **`Panorama.vbs`** for a console-free start. The built app runs from `file://` and camera works (verified). |

**Architecture — the three swappable boundaries are in place:**
- `ViewerTracker` (`src/core/tracker/`) — `MediaPipeFaceTracker` today; pose-based impl can be added for Phase 2.
- `SceneRenderer` (`src/core/render/`) — `ThreeRenderer` today; an Unreal/pixel-stream impl could replace it (Phase 3).
- `ThreeScene` (`src/scenes/`) — scenes registered in `src/scenes/registry.ts`; the rest of the app is scene-agnostic.

**How to run / verify**
- Electron app: `npm run dev` (needs Node on PATH: `C:\Program Files\nodejs`).
- Browser-only UI iteration: `npm run dev:web` (port 5180). Camera is blocked in the
  headless preview, so it shows attract mode — that's expected.
- Unit tests: `npm test` (42 passing). Typecheck: `npm run typecheck`.
- Self-test harnesses (browser): `/?selftest=tracker` (MediaPipe init),
  `/?selftest=track-live` (full pipeline via a synthetic camera),
  `/?selftest=render` (illusion check; `window.panoramaSetEye(x,y,z)` to move the eye).

---

## 2. Key design decisions worth remembering

- **"Dive-in" vs. literal window (depth response).** A literal pane of glass *shrinks*
  distant objects as you approach (the view widens faster than you close on the
  scenery). That felt wrong, so on approach we **dolly the scene toward the viewer**
  (`src/core/geometry/dolly.ts`) so objects loom larger while the view still widens.
  Tunable via `tuning.approachDollyGain` (0 = pure physical window) and
  `approachRestMm`, both exposed as live sliders in the dev Tuning panel. The
  off-axis projection itself is unchanged, so lateral parallax is unaffected.
  Note the known clamp seam (§3).
- **Window height (`tuning.windowHeightMm`).** Laptops sit low (you look *down* at
  them); TVs sit at window height (you look *out*). This knob raises/lowers where the
  window sits above the virtual ground so the scene composes well at any physical
  mounting height. Implemented as a per-scene vertical offset of ground content
  (`ThreeScene.setWindowHeightMm`), leaving sky/clouds/sun fixed.
- **Detection runs on the main thread**, not a worker — MediaPipe's wasm does not
  bootstrap inside a Vite ESM module worker ("ModuleFactory not set"). Paced to
  ~30 fps so it doesn't starve rendering. Worker offload is a future optimization
  behind the same `ViewerTracker` interface.
- **Scenes are procedural** for Phase 1 (self-contained, zero asset licensing). The
  `ThreeScene` contract still allows curated/purchased asset packs later.
- **Scene authoring** goes through `SceneBase` (`src/scenes/lib/SceneBase.ts`), which owns
  the `root` group and build/dispose wiring, plus shared `lib/` helpers (`canvasTexture`,
  `makeGlow`, `tile`, `sinusoidalDrift`, `easeInOut`). A new scene implements `buildScene`
  + `update` and registers in `registry.ts` — no copy-pasted boilerplate. Import aliases
  are defined once in `config/aliases.ts` and shared by all build/test configs.
- **Tracking robustness (blink & off-angle stability).** The viewpoint is taken from
  **blink-stable eye-corner midpoints** (not the iris, which a blink occludes and which
  degrades first under yaw). Depth is **cos(yaw)-corrected** using head yaw read from
  MediaPipe's facial-transformation matrix, because yaw foreshortens the apparent
  inter-eye distance and would otherwise read a turned head as farther away. A real
  per-sample **confidence** (from blink amount + yaw) governs smoothing: below a freeze
  threshold the last good eye is **held** (a blink becomes invisible), otherwise the One
  Euro filter leans harder on the prior as confidence drops; an outlier gate ignores
  implausibly fast jumps. On a real loss the tracked eye **glides** back to the fresh
  position instead of snapping (so a viewer who moved while turned away doesn't see a
  teleport on return). Pure helpers in `src/core/tracker/faceGeometry.ts`; tunables in the
  dev Tuning panel ("Tracking robustness"); live yaw/confidence in the Pose panel.
- **Coordinates:** screen space is millimetres, origin at screen center, +X right,
  +Y up, +Z toward the viewer. Scenes live behind the glass at negative Z.

---

## 3. Known bugs & limitations

- **Physical screen size is unknown on Windows.** Electron can't report real mm, so
  `DisplayInfo.physical*` is `null` and we start from default screen dimensions. The
  calibration wizard now lets the user enter their screen diagonal (and optionally
  measure the camera FOV), which resolves this; until the wizard is run, absolute
  depth scale is approximate.
- **Audio controls are wired but silent.** Settings/control-bar have ambient-sound
  enable + volume, but there is no audio module yet, so nothing plays. **Deferred to a
  later phase** by decision (see §4).
- **Live webcam tracking — verified on-device (2026-06-19).** Confirmed on the real
  laptop webcam: first-person lock holds (#1), and eye X/Y/Z track correctly in both
  directions (X −29→+109 mm, Z 302→567 mm) with no tracking dropouts (blend stayed
  1.0) and visible scene parallax. The headless preview still blocks `getUserMedia`,
  so automated CI continues to rely on the synthetic-camera self-test + unit tests.
- **Blink / off-angle wobble — addressed (needs on-device confirmation).** The
  robustness work (corner-midpoint viewpoint, cos(yaw) depth correction,
  confidence-gated hold, eased re-acquire — see §2) targets the reported blink lurch and
  the >45° yaw instability. Unit-tested; the blink/yaw/confidence paths require a real
  face, so confirm on-device with the Pose panel's yaw/confidence readout.
- **Fully turned away *and* moved — still imperfect (Phase 2).** With the face invisible
  there is no viewpoint data, so the held view is necessarily stale; if the viewer walks
  while turned around, the view is wrong until they turn back (now eased, not snapped).
  A real fix needs the **body-pose fallback tracker** (§5) — a single front camera can't
  solve this from the face alone.
- **Dolly "clamp seam" (~16 in).** The dive-in dolly is capped so near content can't
  pass through the glass; with default gain the cap is hit ~16 in from the screen.
  Closer than that, objects stop growing while the view keeps widening — a noticeable
  tuning seam. Softening the hard cap into a taper is **deferred to a later phase**
  (see §4); it is adjustable in the meantime via the dev Tuning sliders.
- **Detection on main thread** can compete with rendering on heavy scenes (see §2).
- **Test depth scene** near pillars cross the glass plane at high dolly — diagnostic
  scene only; the landscape keeps content far enough back to be safe.
- **Aspect mismatch** when not fullscreen: the off-axis projection is built for the
  physical screen aspect, so a non-matching window stretches the image. Correct in
  real fullscreen on the target display.
- **Single-file `.exe` packaging is blocked on this machine.** `npm run package`
  (electron-builder portable) fails extracting `winCodeSign` because creating
  symlinks needs Windows **Developer Mode** or an elevated shell. Enable Developer
  Mode to produce a true standalone exe; until then use `Panorama.cmd` (runs the
  built app, no packaging needed).

---

## 4. Immediate next milestones

**Phase 1 (M1–M8) is complete**, validated on-device, and closed out (tracking
hold-window, launcher, polished landscape, tracking-robustness pass). Remaining work:

- **Active:** more scenes (beach/city) behind the existing `ThreeScene` contract
  (landscape + space station shipped); on-device confirmation of the tracking-robustness
  pass (§3).
- **Phase 2:** drive an external TV over HDMI (see §5) — primarily a `CameraPlacement`
  calibration for an off-axis camera, plus a pose-based tracker for longer distances and
  the **body-pose fallback** for the turned-away case.

**Deferred to a later phase (by decision):**
- **Ambient audio module** — controls are wired but silent; no audio module yet.
- **Dolly "clamp seam" softening** — taper the hard near cap (§3); tunable for now.

---

## 5. Phase 2 — external monitor / TV (no built-in camera)

Setup: laptop sits near a large TV and drives it over HDMI (extended display); the
laptop's own camera does the tracking. The architecture already anticipates this:

- **Camera→screen transform.** Phase 1 assumes the camera is centered just above the
  screen (`CameraPlacement` ≈ that). Phase 2 only needs the calibration step to set
  `CameraPlacement.position/orientation` for the camera's real location relative to
  the big screen — **no core rewrite**, just new calibration UI + math already present
  in `GeometrySolver`.
- **Longer viewing distances** favor adding a **pose-based `ViewerTracker`** (body /
  upper-body detection) behind the existing interface, for when faces are small/far.
- **Body-pose fallback for the turned-away case (robustness item ⑤).** When the face is
  not visible (viewer fully turned around), keep a coarse head-position estimate from the
  shoulders/upper body and fuse it with the face tracker (face = precise when present,
  body = present-but-coarse otherwise). This is the only real fix for "turned away and
  moved" (§3), and the 6DoF head pose now read in Phase 1 makes the face↔body handoff
  smooth. Lives behind the same `ViewerTracker` interface — no core rewrite.
- **Multi-display handling** in the Electron main process (target the TV, fullscreen
  there, manage which display is the "window").

## 6. Phase 3 — engine swap & richer immersion

- **Alternative `SceneRenderer`** (e.g. Unreal via pixel streaming, or native) behind
  the existing interface, for higher-fidelity scenes — the off-axis eye pose + scene
  dolly are the only contract it must honor.
- **Spatialized audio** (pan/attenuate with the viewer's tracked position) behind the
  (to-be-built) audio module.
- **Move detection to a worker** for headroom once the wasm-in-worker path is solved.
- **More scenes** (beach, city, sci-fi station) and curated/purchased asset packs.
