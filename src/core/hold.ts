/** Progress 0..1 of a press-and-hold gate. */
export const holdProgress = (elapsedMs: number, durationMs: number): number =>
  Math.min(1, Math.max(0, elapsedMs / durationMs));

export const HOLD_MS = 2000;
