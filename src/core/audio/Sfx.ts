import { settings } from '../settings';

type Wave = OscillatorType;

/** Tiny synthesised sound effects (no asset files). Swap for native audio behind this API if latency is bad. */
class SfxImpl {
  private ctx: AudioContext | null = null;

  /** Call from a user gesture to unlock audio on iOS/Android. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Reported output latency in ms (base + output), or null if unavailable. */
  latencyMs(): number | null {
    if (!this.ctx) return null;
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return Math.round(((c.baseLatency ?? 0) + (c.outputLatency ?? 0)) * 1000);
  }

  tone(freq: number, dur = 0.12, wave: Wave = 'sine', gain = 0.25, delay = 0): void {
    if (!settings.get().sound) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  vibrate(pattern: number | number[] = 20): void {
    if (settings.get().haptics) navigator.vibrate?.(pattern);
  }

  click(): void {
    this.tone(660, 0.07, 'triangle');
    this.vibrate(10);
  }
  tick(): void {
    this.tone(440, 0.1, 'square', 0.12);
  }
  go(): void {
    this.tone(880, 0.25, 'square', 0.15);
  }
  score(): void {
    this.tone(523, 0.12, 'triangle');
    this.tone(784, 0.18, 'triangle', 0.25, 0.1);
    this.vibrate(40);
  }
  win(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.25, i * 0.14));
    this.vibrate([60, 40, 60]);
  }
}

export const Sfx = new SfxImpl();
