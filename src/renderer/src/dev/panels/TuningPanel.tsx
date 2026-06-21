import { TuningParams } from '@shared/types'

interface Props {
  tuning: TuningParams
  onChange: (patch: Partial<TuningParams>) => void
  onReset: () => void
}

/** Live tuning sliders. Changes flow straight to the running engine. */
export function TuningPanel({ tuning, onChange, onReset }: Props) {
  return (
    <div className="dev-section">
      <Group label="Depth / “dive-in”">
        <Slider
          label="approach dolly gain"
          hint="how strongly objects loom as you lean in (0 = literal window)"
          min={0}
          max={15}
          step={0.5}
          value={tuning.approachDollyGain}
          onChange={(v) => onChange({ approachDollyGain: v })}
        />
        <Slider
          label="approach rest (mm)"
          hint="distance treated as the neutral resting point"
          min={300}
          max={1000}
          step={10}
          value={tuning.approachRestMm}
          onChange={(v) => onChange({ approachRestMm: v })}
        />
        <Slider
          label="window height (mm)"
          hint="how high the window sits above the ground (low = look out; high = look down)"
          min={0}
          max={15000}
          step={100}
          value={tuning.windowHeightMm}
          onChange={(v) => onChange({ windowHeightMm: v })}
        />
      </Group>

      <Group label="Parallax & smoothing">
        <Slider
          label="parallax gain"
          hint="lateral head-movement sensitivity (1 = physically correct)"
          min={0.2}
          max={3}
          step={0.05}
          value={tuning.parallaxGain}
          onChange={(v) => onChange({ parallaxGain: v })}
        />
        <Slider
          label="smoothing min-cutoff"
          hint="lower = smoother but laggier"
          min={0.1}
          max={5}
          step={0.05}
          value={tuning.oneEuroMinCutoff}
          onChange={(v) => onChange({ oneEuroMinCutoff: v })}
        />
        <Slider
          label="smoothing beta"
          hint="higher = snappier on fast moves"
          min={0}
          max={0.5}
          step={0.005}
          value={tuning.oneEuroBeta}
          onChange={(v) => onChange({ oneEuroBeta: v })}
        />
      </Group>

      <Group label="Tracking robustness">
        <Slider
          label="yaw cos floor"
          hint="depth correction limit for head turns (lower = correct steeper angles)"
          min={0.2}
          max={1}
          step={0.05}
          value={tuning.yawCosFloor}
          onChange={(v) => onChange({ yawCosFloor: v })}
        />
        <Slider
          label="confidence freeze"
          hint="hold the view when tracking confidence drops below this (rides out blinks)"
          min={0}
          max={0.9}
          step={0.05}
          value={tuning.confidenceFreeze}
          onChange={(v) => onChange({ confidenceFreeze: v })}
        />
        <Slider
          label="low-confidence cutoff"
          hint="extra smoothing when unsure (lower = steadier, laggier)"
          min={0.05}
          max={2}
          step={0.05}
          value={tuning.lowConfMinCutoff}
          onChange={(v) => onChange({ lowConfMinCutoff: v })}
        />
        <Slider
          label="jump gate (mm/s)"
          hint="ignore implausibly fast eye jumps above this speed"
          min={500}
          max={8000}
          step={250}
          value={tuning.jumpGateMmPerSec}
          onChange={(v) => onChange({ jumpGateMmPerSec: v })}
        />
      </Group>

      <Group label="Frustum">
        <Slider
          label="near plane (mm)"
          min={10}
          max={500}
          step={10}
          value={tuning.nearPlaneMm}
          onChange={(v) => onChange({ nearPlaneMm: v })}
        />
        <Slider
          label="far plane (mm)"
          min={20000}
          max={200000}
          step={5000}
          value={tuning.farPlaneMm}
          onChange={(v) => onChange({ farPlaneMm: v })}
        />
        <label className="dev-check">
          <input
            type="checkbox"
            checked={tuning.freeze}
            onChange={(e) => onChange({ freeze: e.target.checked })}
          />
          freeze pose
        </label>
      </Group>

      <button className="dev-reset" onClick={onReset}>
        Reset to defaults
      </button>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="dev-group">
      <div className="dev-group-label">{label}</div>
      {children}
    </div>
  )
}

function Slider({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange
}: {
  label: string
  hint?: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="dev-slider">
      <div className="dev-slider-head">
        <span>{label}</span>
        <b>{Number.isInteger(step) ? value.toFixed(0) : value.toFixed(3)}</b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <div className="dev-slider-hint">{hint}</div>}
    </div>
  )
}
