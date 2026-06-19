// © CoreConduit Consulting Services — MIT License

export type EasingFn = (t: number) => number;

export const easings = {
  linear: (t: number) => t,
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeOut: (t: number) => 1 - (1 - t) ** 2,
  easeIn: (t: number) => t * t,
  spring: (t: number) => {
    // Underdamped spring: overshoots slightly, settles at 1
    const decay = 1 - t;
    return 1 - decay * Math.cos(t * Math.PI * 2.5) * Math.exp(-t * 4);
  },
} satisfies Record<string, EasingFn>;

export type TweenOptions = {
  from: number;
  to: number;
  durationMs: number;
  easing?: EasingFn;
  onUpdate?: (value: number) => void;
  onComplete?: () => void;
};

export class Tween {
  private from: number;
  private to: number;
  private durationMs: number;
  private easing: EasingFn;
  private onUpdate?: (value: number) => void;
  private onComplete?: () => void;
  private elapsed = 0;
  private done = false;

  constructor(opts: TweenOptions) {
    this.from = opts.from;
    this.to = opts.to;
    this.durationMs = opts.durationMs;
    this.easing = opts.easing ?? easings.easeInOutQuad;
    this.onUpdate = opts.onUpdate;
    this.onComplete = opts.onComplete;
  }

  get isComplete(): boolean {
    return this.done;
  }

  advance(deltaMs: number): number {
    if (this.done) return this.to;

    this.elapsed += deltaMs;
    const t = Math.min(this.elapsed / this.durationMs, 1);
    const value = this.from + (this.to - this.from) * this.easing(t);

    this.onUpdate?.(value);

    if (t >= 1) {
      this.done = true;
      this.onComplete?.();
    }

    return value;
  }

  currentValue(): number {
    if (this.done) return this.to;
    const t = Math.min(this.elapsed / this.durationMs, 1);
    return this.from + (this.to - this.from) * this.easing(t);
  }
}
