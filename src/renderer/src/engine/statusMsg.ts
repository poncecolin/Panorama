import { EngineStatusMsg } from '@shared/types'
import type { EngineStatus } from './PanoramaEngine'

/**
 * Adapters between the rich (local) EngineStatus and the slim, serializable
 * EngineStatusMsg streamed scene → control in TV mode. Type-only import of
 * EngineStatus keeps this module free of the renderer/MediaPipe runtime, so the
 * control window can use it without pulling in the engine.
 */

/** Scene window: pack the engine status for the wire (drops heavy per-frame faces). */
export function toStatusMsg(s: EngineStatus): EngineStatusMsg {
  return {
    state: s.state,
    blend: s.blend,
    eyeMm: s.eyeMm,
    renderFps: s.renderFps,
    slowFrames: s.slowFrames,
    cameraError: s.cameraError,
    sample: s.frame?.sample ?? null,
    detectFps: s.frame?.detectFps ?? 0,
    faceSizePct: s.faceSizePct,
    depthJitterMm: s.depthJitterMm
  }
}

/** Control window: rebuild an EngineStatus shape the dev panels understand. */
export function fromStatusMsg(m: EngineStatusMsg): EngineStatus {
  return {
    state: m.state,
    blend: m.blend,
    eyeMm: m.eyeMm,
    renderFps: m.renderFps,
    slowFrames: m.slowFrames,
    cameraError: m.cameraError,
    faceSizePct: m.faceSizePct,
    depthJitterMm: m.depthJitterMm,
    frame: m.sample
      ? {
          sample: m.sample,
          faces: [],
          videoWidth: 0,
          videoHeight: 0,
          timestamp: m.sample.timestamp,
          detectMs: 0,
          detectFps: m.detectFps
        }
      : null
  }
}
