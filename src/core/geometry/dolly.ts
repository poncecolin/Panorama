/**
 * "Dive-in" depth response. A literal window shrinks distant objects as the
 * viewer approaches (the view widens faster than you close on the scenery). For
 * a more immersive "magic window" we instead translate the scene toward the
 * viewer as they approach, so objects loom larger. The off-axis projection is
 * left untouched, preserving lateral parallax and the wider-view-on-approach.
 *
 * @returns a +Z (toward-viewer) translation in mm to apply to the scene root.
 *          Positive when the viewer is closer than rest (objects come forward);
 *          negative when farther (objects recede). Clamped to avoid pushing
 *          content through the glass.
 */
export function computeApproachDolly(
  eyeZmm: number,
  restMm: number,
  gain: number,
  maxMm = 1200
): number {
  const dolly = (restMm - eyeZmm) * gain
  return Math.max(-maxMm, Math.min(maxMm, dolly))
}
