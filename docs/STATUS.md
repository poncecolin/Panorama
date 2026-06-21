# Panorama — Project Status

_Living document. Update as milestones land. Last updated: 2026-06-21._

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
| TV mode (Phase 2) | 🟡 Built · needs on-device test | Laptop-next-to-TV over HDMI. Calibration **profiles** (`laptop`/`tv`) in settings; **dual windows** (scene fullscreen on the TV + control surface on the laptop) with cross-window IPC; **TV calibration wizard** using the viewer as a measurement probe; pure `tvCalibration` solver. See §2/§5. Verified short of real hardware (typecheck, 59 tests, build, solo-mode parity); the dual-window/camera path needs validation on an actual television. |

**Architecture — the three swappable boundaries are in place:**
- `ViewerTracker` (`src/core/tracker/`) — `MediaPipeFaceTracker` today; pose-based impl can be added for Phase 2.
- `SceneRenderer` (`src/core/render/`) — `ThreeRenderer` today; an Unreal/pixel-stream impl could replace it (Phase 3).
- `ThreeScene` (`src/scenes/`) — scenes registered in `src/scenes/registry.ts`; the rest of the app is scene-agnostic.

**How to run / verify**
- Electron app: `npm run dev` (needs Node on PATH: `C:\Program Files\nodejs`).
- Browser-only UI iteration: `npm run dev:web` (port 5180). Camera is blocked in the
  headless preview, so it shows attract mode — that's expected.
- Unit tests: `npm test` (59 passing). Typecheck: `npm run typecheck`.
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
- **Calibration profiles (Phase 2).** `AppSettings` no longer holds a single
  `placement`/`screen`; it holds `profiles.{laptop,tv}` (each a `CameraPlacement` +
  `ScreenGeometry`) plus an `activeProfile`. The engine renders through the active
  profile. `intrinsics` (the one physical camera lens) and `viewer` (IPD) stay
  top-level. Legacy Phase-1 saves migrate into `profiles.laptop` automatically. A
  `SettingsPatch` type allows partial profile edits; the model carries full 6-DoF so
  arbitrary placement is a later additive step.
- **Dual-surface windows (TV mode).** Laptop mode is one `solo` window (engine +
  overlays, as Phase 1). TV mode opens two windows: a `scene` window fullscreen on the
  TV (owns the engine, tracker, and camera) and a `control` window on the laptop
  (wizard + overlays, no engine). One renderer bundle serves all three, routed by
  `?surface=scene` and the active profile. Cross-window IPC: a `settings:changed`
  broadcast keeps both in sync (so fine-tune sliders live-preview on the TV), an
  `engine:status` stream feeds the control window's panels/wizard, and a
  `scene:command` channel drives the calibration reference scene — all relayed by main.
- **TV calibration = the viewer as a measurement probe.** The off-axis frustum makes a
  virtual marker at a known screen-space position appear/disappear exactly when the eye
  crosses a specific plane, so "move until the red marker touches the right edge" is a
  geometric constraint, not eyeballing. The wizard captures the camera-frame eye at each
  trigger and `tvCalibration.solvePlacement` (damped Gauss–Newton/LM) recovers the
  camera placement. Constrained DoF (centered, level, facing the room) stay pinned;
  widening to full 6-DoF is just enlarging the solver's `free` list. The shared
  camera↔screen math lives in `cameraModel.ts` so the solver and calibrator can't drift.

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
- **TV mode — built, not yet validated on a real television.** Profiles, dual windows,
  cross-window IPC, the calibration wizard, and the `tvCalibration` solver are complete
  and verified short of hardware (typecheck, 59 unit tests incl. solver-recovery and
  settings-migration, build, and solo-mode parity in the browser). The dual-window +
  camera-on-TV path can't run in the headless harness, so the end-to-end flow (plug in
  HDMI → pick display → run the probe wizard → confirm parallax from the calibrated
  spot) must be exercised on an actual TV. Pitch vs. vertical-offset can be
  ill-conditioned at a single distance — mitigated with two-depth probes; the fine-tune
  sliders are the fallback.
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

- **Phase 2 (in progress):** drive an external TV over HDMI (see §5). The calibration
  foundation, dual-window surfaces, cross-window IPC, and the probe-based TV calibration
  wizard are **built** (P2.1–P2.6); next is **on-device validation on a real TV** (P2.7,
  §3). Still deferred within Phase 2: a pose-based tracker for longer distances and the
  **body-pose fallback** for the turned-away case.
- **Active:** more scenes (beach/city) behind the existing `ThreeScene` contract
  (landscape + space station shipped); on-device confirmation of the tracking-robustness
  pass (§3).

**Deferred to a later phase (by decision):**
- **Ambient audio module** — controls are wired but silent; no audio module yet.
- **Dolly "clamp seam" softening** — taper the hard near cap (§3); tunable for now.

---

## 5. Phase 2 — external monitor / TV (no built-in camera)

Setup: laptop sits near a large TV and drives it over HDMI (extended display); the
laptop's own camera does the tracking. The architecture already anticipated this, and
the calibration + windowing layer is now built (P2.1–P2.6):

- **✅ Camera→screen transform via profiles.** `CameraPlacement`/`ScreenGeometry` now
  live in a `tv` profile set by the TV calibration wizard — **no core rewrite**, the
  off-axis math in `GeometrySolver` was already 6-DoF capable.
- **✅ Constrained, probe-based calibration.** The wizard recommends a centered placement
  (collapsing x/yaw/roll≈0) and solves the remaining drop/forward/pitch from "move until
  the marker grazes the edge" probe events (`tvCalibration.solvePlacement`), then offers
  a live fine-tune. Designed to widen to arbitrary placement later (enlarge the `free`
  list). See §2.
- **✅ Dual-window / multi-display handling.** Electron main enumerates displays, opens
  the scene window fullscreen on the TV and the control window on the laptop, and relays
  IPC between them. Manual `laptop`/`tv` mode switch (no flaky per-display auto-profiles).
- **⏳ On-device validation (P2.7).** The only remaining Phase-2-foundation step: confirm
  the flow on a real television (§3).
- **Longer viewing distances** favor adding a **pose-based `ViewerTracker`** (body /
  upper-body detection) behind the existing interface, for when faces are small/far.
  Deferred; the current wizard targets face-tracking range (~0.5–2.5 m).
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
