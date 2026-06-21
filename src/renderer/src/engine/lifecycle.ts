import { TrackingState } from '@shared/types'

/**
 * Pure tracking-lifecycle decisions, split out for unit testing.
 *
 * Behavior: when the viewer is briefly lost (turning to the side, glancing away),
 * Panorama HOLDS the last known view for `holdMs` rather than immediately gliding
 * to attract — people naturally turn back and forth, and snapping to attract every
 * time is jarring. Only after the hold window elapses does it ease to attract.
 */
export interface LifecycleConfig {
  /** How long to hold the last view after losing the viewer (ms). */
  holdMs: number
  /** Below this gap we consider the viewer actively present (ms). */
  activeMs: number
  /** Glide time-constant (ms) for easing back to a fresh sample after a real loss. */
  reacquireTauMs: number
}

export const DEFAULT_LIFECYCLE: LifecycleConfig = {
  holdMs: 20000,
  activeMs: 500,
  reacquireTauMs: 450
}

/** Target for the tracked↔attract blend: 1 while present or holding, else 0. */
export function blendTarget(lostMs: number, cfg: LifecycleConfig): number {
  return lostMs < cfg.holdMs ? 1 : 0
}

/**
 * Glide time-constant (ms) to ease the tracked eye toward a freshly arrived
 * sample, chosen by how long the viewer was absent. A brief gap (≤ activeMs —
 * a blink or micro-turn) returns 0 = catch up instantly (no added lag over
 * steady tracking); a longer absence returns `reacquireTauMs` so a viewer who
 * moved while turned away doesn't see the view teleport when they look back.
 */
export function reacquireTau(lostMs: number, cfg: LifecycleConfig): number {
  return lostMs <= cfg.activeMs ? 0 : cfg.reacquireTauMs
}

/** Human-facing lifecycle state for the dev panel / status. */
export function resolveState(
  everTracked: boolean,
  lostMs: number,
  blend: number,
  cfg: LifecycleConfig
): TrackingState {
  if (!everTracked && blend < 0.02) return TrackingState.Acquiring
  if (lostMs < cfg.activeMs) {
    return blend > 0.9 ? TrackingState.Tracking : TrackingState.GlideToTrack
  }
  if (lostMs < cfg.holdMs) return TrackingState.Holding
  if (blend < 0.02) return TrackingState.Attract
  return TrackingState.GlideToAttract
}
