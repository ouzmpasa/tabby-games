import { HOLD_MS, holdProgress } from '../../src/core/hold';

export const hold = (ms: number): number => holdProgress(ms, HOLD_MS);
