/**
 * Smoothstep-style ease (in-out cubic). Maps [0,1] → [0,1] with zero velocity at
 * both ends, so motion along a path accelerates out of the start and decelerates
 * into the destination instead of moving at a constant clip.
 */
export function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
}
