import { other, type PlayerId } from '../types';

export interface MatchOptions {
  /** Points needed to win. */
  target: number;
  /** If true, the winner must also lead by 2 (default false). */
  winByTwo?: boolean;
}

/** Pure score keeping for a first-to-N match. */
export class MatchState {
  readonly scores: [number, number] = [0, 0];
  private _winner: PlayerId | null = null;

  constructor(private opts: MatchOptions) {
    if (!Number.isInteger(opts.target) || opts.target < 1) throw new Error('target must be a positive integer');
  }

  get target(): number {
    return this.opts.target;
  }

  get winner(): PlayerId | null {
    return this._winner;
  }

  get over(): boolean {
    return this._winner !== null;
  }

  /** Adds a point; ignored once the match is over. Returns the winner if this point ended the match. */
  addPoint(p: PlayerId): PlayerId | null {
    if (this._winner !== null) return null;
    this.scores[p]++;
    const lead = this.scores[p] - this.scores[other(p)];
    if (this.scores[p] >= this.opts.target && (!this.opts.winByTwo || lead >= 2)) {
      this._winner = p;
      return p;
    }
    return null;
  }

  reset(): void {
    this.scores[0] = 0;
    this.scores[1] = 0;
    this._winner = null;
  }
}
