import { useEffect, useRef } from 'react'
import { EngineStatus } from '../../engine/PanoramaEngine'

interface Props {
  status: EngineStatus | null
}

/** Render/detect rates, latency, and render-hitch count, with an fps sparkline. */
export function PerfPanel({ status }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const history = useRef<number[]>([])
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    let raf = 0
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const fps = statusRef.current?.renderFps ?? 0
      const h = history.current
      h.push(fps)
      if (h.length > W) h.shift()

      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#0b0e14'
      ctx.fillRect(0, 0, W, H)

      // 60 and 30 fps reference lines.
      for (const ref of [60, 30]) {
        const y = H - (ref / 75) * H
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
        ctx.fillStyle = '#6b7480'
        ctx.font = '9px ui-monospace, monospace'
        ctx.fillText(String(ref), 2, y - 2)
      }

      ctx.strokeStyle = '#46d18a'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      h.forEach((v, i) => {
        const y = H - Math.min(v, 75) / 75 * H
        if (i === 0) ctx.moveTo(i, y)
        else ctx.lineTo(i, y)
      })
      ctx.stroke()
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  const f = status?.frame
  const detectMs = f?.detectMs ?? 0
  // Rough motion-to-photon estimate: detection time + one render frame.
  const renderMs = status && status.renderFps > 0 ? 1000 / status.renderFps : 0
  const latency = detectMs + renderMs

  return (
    <div className="dev-section">
      <canvas ref={canvasRef} width={340} height={90} className="dev-cam-canvas" />
      <div className="dev-rows">
        <Row k="render" v={`${(status?.renderFps ?? 0).toFixed(0)} fps`} />
        <Row k="detect" v={f ? `${f.detectFps.toFixed(0)} fps` : 'no camera'} />
        <Row k="detect time" v={f ? `${detectMs.toFixed(1)} ms` : '—'} />
        <Row k="est. latency" v={f ? `${latency.toFixed(0)} ms` : '—'} />
        <Row k="faces" v={f ? String(f.faces.length) : '—'} />
        <Row k="render hitches" v={String(status?.slowFrames ?? 0)} />
      </div>
      <p className="dev-note">
        Est. latency ≈ detection time + one render frame (motion-to-photon proxy).
        Detection runs on the main thread for now.
      </p>
    </div>
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
