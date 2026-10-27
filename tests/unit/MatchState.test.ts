import { describe, expect, it } from 'vitest';
import { MatchState } from '../../src/core/match/MatchState';

describe('MatchState', () => {
  it('starts at 0-0 with no winner', () => {
    const m = new MatchState({ target: 3 });
    expect(m.scores).toEqual([0, 0]);
    expect(m.winner).toBeNull();
  });
  it('first to target wins and further points are ignored', () => {
    const m = new MatchState({ target: 3 });
    m.addPoint(0);
    m.addPoint(1);
    m.addPoint(0);
    expect(m.addPoint(0)).toBe(0);
    expect(m.winner).toBe(0);
    expect(m.over).toBe(true);
    expect(m.addPoint(1)).toBeNull();
    expect(m.scores).toEqual([3, 1]);
  });
  it('win-by-two needs a 2 point lead', () => {
    const m = new MatchState({ target: 2, winByTwo: true });
    m.addPoint(0); m.addPoint(1); m.addPoint(0); m.addPoint(1);
    expect(m.winner).toBeNull();
    m.addPoint(0);
    expect(m.winner).toBeNull();
    m.addPoint(0);
    expect(m.winner).toBe(0);
  });
  it('reset clears everything', () => {
    const m = new MatchState({ target: 1 });
    m.addPoint(1);
    m.reset();
    expect(m.scores).toEqual([0, 0]);
    expect(m.winner).toBeNull();
  });
  it('rejects an invalid target', () => {
    expect(() => new MatchState({ target: 0 })).toThrow();
  });
});
