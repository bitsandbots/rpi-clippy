// © CoreConduit Consulting Services — MIT License

const DEFAULT_FPS_CAP = 30;

export type FrameCallback = (deltaMs: number) => void;

export class AnimationLoop {
  private callback: FrameCallback;
  private fpsCap: number;
  private minFrameMs: number;
  private rafId: number | null = null;
  private lastTimestamp: number | null = null;
  private reducedMotion: boolean;
  private hidden: boolean;
  private visibilityHandler: (() => void) | null = null;

  constructor(callback: FrameCallback, fpsCap = DEFAULT_FPS_CAP) {
    this.callback = callback;
    this.fpsCap = fpsCap;
    this.minFrameMs = 1000 / fpsCap;
    this.reducedMotion = this.checkReducedMotion();
    this.hidden = typeof document !== "undefined" ? document.hidden : false;
  }

  private checkReducedMotion(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  start(): void {
    if (this.rafId !== null) return;

    if (typeof document !== "undefined") {
      this.visibilityHandler = () => {
        this.hidden = document.hidden;
        if (!this.hidden && this.rafId === null) {
          this.lastTimestamp = null;
          this.schedule();
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }

    this.schedule();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.lastTimestamp = null;
  }

  private schedule(): void {
    if (this.hidden) return;
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  private tick(timestamp: number): void {
    this.rafId = null;

    if (this.hidden) return;

    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp;
      this.schedule();
      return;
    }

    const elapsed = timestamp - this.lastTimestamp;
    if (elapsed < this.minFrameMs) {
      this.schedule();
      return;
    }

    this.lastTimestamp = timestamp;
    // Cap delta to 100 ms to avoid spiral-of-death after tab resume
    const delta = Math.min(elapsed, 100);
    this.callback(delta);
    this.schedule();
  }

  get isRunning(): boolean {
    return this.rafId !== null;
  }

  /** True when the user has opted into reduced-motion OS preference. */
  get isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  /** Force a single tick with a fixed delta — used in tests. */
  tickOnce(deltaMs: number): void {
    this.callback(deltaMs);
  }
}
