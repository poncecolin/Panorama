import { AppSettings } from '@shared/types'
import { activeCalibration } from '@shared/settings'
import { EngineStatus } from '../../engine/PanoramaEngine'

interface Props {
  status: EngineStatus | null
  settings: AppSettings
}

const DEG = 180 / Math.PI

/**
 * Numeric eye pose plus top-down and side schematics of the viewer relative to
 * the screen and the off-axis frustum.
 */
export function PosePanel({ status, settings }: Props) {
  const eye = status?.eyeMm ?? { x: 0, y: 0, z: 600 }
  const screen = activeCalibration(settings).screen
  const hAngle = Math.atan2(eye.x, eye.z) * DEG
  const vAngle = Math.atan2(eye.y, eye.z) * DEG
  const dist = Math.sqrt(eye.x * eye.x + eye.y * eye.y + eye.z * eye.z)

  return (
    <div className="dev-section">
      <div className="dev-rows">
        <Row k="eye X (mm)" v={eye.x.toFixed(0)} />
        <Row k="eye Y (mm)" v={eye.y.toFixed(0)} />
        <Row k="eye Z / depth (mm)" v={eye.z.toFixed(0)} />
        <Row k="distance (mm)" v={dist.toFixed(0)} />
        <Row k="h-angle (°)" v={hAngle.toFixed(1)} />
        <Row k="v-angle (°)" v={vAngle.toFixed(1)} />
        <Row k="tracked" v={status?.frame?.sample ? 'yes' : 'no (attract)'} />
        <Row k="head yaw (°)" v={(status?.frame?.sample?.yawDeg ?? 0).toFixed(1)} />
        <Row k="confidence" v={(status?.frame?.sample?.confidence ?? 0).toFixed(2)} />
        <Row k="blend" v={(status?.blend ?? 0).toFixed(2)} />
      </div>

      <div className="dev-diagram-label">top-down (X / Z)</div>
      <PlanDiagram a={eye.x} depth={eye.z} halfSpan={screen.widthMm / 2} />
      <div className="dev-diagram-label">side (Y / Z)</div>
      <PlanDiagram a={eye.y} depth={eye.z} halfSpan={screen.heightMm / 2} />
    </div>
  )
}

/** Generic 2D frustum schematic: a fixed screen segment + the eye + sight lines. */
function PlanDiagram({
  a,
  depth,
  halfSpan
}: {
  a: number
  depth: number
  halfSpan: number
}) {
  const W = 340
  const H = 150
  const cx = W / 2
  const screenY = H - 22
  // World ranges → pixels.
  const worldHalf = 900 // mm shown to each side
  const worldDepth = 1600 // mm shown in depth
  const sx = (mm: number) => cx + (mm / worldHalf) * (W / 2 - 16)
  const sz = (mm: number) => screenY - (Math.max(0, mm) / worldDepth) * (screenY - 14)

  const screenL = sx(-halfSpan)
  const screenR = sx(halfSpan)
  const ex = sx(a)
  const ez = sz(depth)

  return (
    <svg className="dev-diagram" viewBox={`0 0 ${W} ${H}`}>
      {/* sight lines through the screen edges */}
      <line x1={ex} y1={ez} x2={screenL} y2={screenY} stroke="#5b9dff" strokeWidth={1.2} />
      <line x1={ex} y1={ez} x2={screenR} y2={screenY} stroke="#5b9dff" strokeWidth={1.2} />
      {/* screen (the glass) */}
      <line x1={screenL} y1={screenY} x2={screenR} y2={screenY} stroke="#e8ecf3" strokeWidth={3} />
      {/* center axis */}
      <line x1={cx} y1={screenY} x2={cx} y2={14} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3 3" />
      {/* eye */}
      <circle cx={ex} cy={ez} r={5} fill="#46d18a" />
      <text x={cx} y={H - 6} fill="#9aa3b2" fontSize={10} textAnchor="middle">
        screen
      </text>
    </svg>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="dev-row">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  )
}
