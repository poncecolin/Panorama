import { useEffect, useRef } from 'react'
import { EngineStatus } from '../../engine/PanoramaEngine'

interface Props {
  status: EngineStatus | null
  getVideo: () => HTMLVideoElement | null
}

/**
 * Live camera feed with the detected face mesh, bounding boxes, eye points, and a
 * highlight of the locked (first-person) face vs. ignored newcomers.
 */
export function CameraPanel({ status, getVideo }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    let raf = 0
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const video = getVideo()
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      if (!video || video.readyState < 2) {
        ctx.fillStyle = '#0b0e14'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#9aa3b2'
        ctx.font = '13px ui-monospace, monospace'
        ctx.textAlign = 'center'
        const err = statusRef.current?.cameraError
        ctx.fillText(err ? 'Camera unavailable' : 'Waiting for camera…', W / 2, H / 2 - 8)
        if (err) ctx.fillText(`(${err})`, W / 2, H / 2 + 12)
        return
      }

      // Cover-fit the video into the canvas.
      const scale = Math.max(W / video.videoWidth, H / video.videoHeight)
      const vw = video.videoWidth * scale
      const vh = video.videoHeight * scale
      const ox = (W - vw) / 2
      const oy = (H - vh) / 2
      ctx.drawImage(video, ox, oy, vw, vh)

      const toX = (nx: number) => ox + nx * vw
      const toY = (ny: number) => oy + ny * vh

      const frame = statusRef.current?.frame
      if (frame) {
        for (const f of frame.faces) {
          const locked = f.locked
          ctx.strokeStyle = locked ? '#46d18a' : '#ff6b6b'
          ctx.lineWidth = locked ? 3 : 1.5
          ctx.strokeRect(toX(f.box.x), toY(f.box.y), f.box.width * vw, f.box.height * vh)

          // Sparse mesh dots.
          ctx.fillStyle = locked ? 'rgba(70,209,138,0.5)' : 'rgba(255,107,107,0.4)'
          for (let i = 0; i < f.landmarks.length; i += 6) {
            const p = f.landmarks[i]
            ctx.fillRect(toX(p.x) - 1, toY(p.y) - 1, 2, 2)
          }

          // Eyes.
          ctx.fillStyle = locked ? '#eaffea' : '#ffe0e0'
          for (const e of [f.leftEye, f.rightEye]) {
            ctx.beginPath()
            ctx.arc(toX(e.x), toY(e.y), 3.5, 0, Math.PI * 2)
            ctx.fill()
          }

          if (locked && f.faceId != null) {
            ctx.fillStyle = '#46d18a'
            ctx.font = 'bold 12px ui-monospace, monospace'
            ctx.textAlign = 'left'
            ctx.fillText(`#${f.faceId} locked`, toX(f.box.x), toY(f.box.y) - 6)
          }
        }
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [getVideo])

  const frame = status?.frame
  return (
    <div className="dev-section">
      <canvas
        ref={canvasRef}
        width={340}
        height={255}
        className="dev-cam-canvas"
      />
      <div className="dev-rows">
        <Row k="faces detected" v={frame ? String(frame.faces.length) : '—'} />
        <Row
          k="locked viewer"
          v={status?.frame?.sample ? `#${status.frame.sample.faceId}` : 'none'}
        />
        <Row
          k="frame size"
          v={frame ? `${frame.videoWidth}×${frame.videoHeight}` : '—'}
        />
      </div>
      <p className="dev-note">
        Green = the locked first-person viewer. Red = ignored newcomers. Feed is raw
        (un-mirrored).
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
