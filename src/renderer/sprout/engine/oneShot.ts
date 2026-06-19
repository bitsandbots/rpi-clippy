// © CoreConduit Consulting Services — MIT License

import type { ExpressionParams } from "./blendSpace";

export type TrackFilter = keyof ExpressionParams;

export type OneShotDef = {
  key: string;
  durationMs: number;
  /** Which expression tracks this overlay owns; mood keeps the rest. */
  filteredTracks: TrackFilter[];
  /** Expression target during the overlay (only filtered tracks are applied). */
  target: Partial<ExpressionParams>;
  /** If true, the overlay can interrupt an active one of the same key. */
  interruptSelf?: boolean;
};

export type ActiveOverlay = {
  def: OneShotDef;
  elapsed: number;
};

export class OneShotLayer {
  private active: ActiveOverlay[] = [];

  fire(def: OneShotDef): void {
    if (def.interruptSelf === false) {
      if (this.active.some((o) => o.def.key === def.key)) return;
    } else {
      // Default: interrupt same key
      this.active = this.active.filter((o) => o.def.key !== def.key);
    }
    this.active.push({ def, elapsed: 0 });
  }

  advance(deltaMs: number): void {
    this.active = this.active.filter((o) => {
      o.elapsed += deltaMs;
      return o.elapsed < o.def.durationMs;
    });
  }

  get hasActive(): boolean {
    return this.active.length > 0;
  }

  /** True while an overlay with the given key is still playing. */
  isActive(key: string): boolean {
    return this.active.some((o) => o.def.key === key);
  }

  /**
   * Compose overlays onto a base expression. Later overlays win on conflict.
   * Only filteredTracks are written; the base value is preserved for others.
   */
  compose(base: ExpressionParams): ExpressionParams {
    if (this.active.length === 0) return base;

    const result = { ...base };
    for (const overlay of this.active) {
      const t = Math.min(overlay.elapsed / overlay.def.durationMs, 1);
      // Simple linear blend into target over first 20% / out over last 20%
      const envelope = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;

      for (const track of overlay.def.filteredTracks) {
        const targetVal = overlay.def.target[track];
        if (targetVal !== undefined) {
          const baseVal = base[track] as number;
          (result[track] as number) =
            baseVal + (targetVal - baseVal) * envelope;
        }
      }
    }
    return result;
  }

  clearAll(): void {
    this.active = [];
  }
}
