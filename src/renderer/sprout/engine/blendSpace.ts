// © CoreConduit Consulting Services — MIT License

export type ExpressionParams = {
  leafDroop: number; // 0–40 deg
  stemLean: number; // -10 to +10 deg
  colorSaturation: number; // 0.3–1.0
  swayAmplitude: number; // 0–6 deg
  swayPeriod: number; // 2000–5000 ms
  eyeOpenness: number; // 0.2–1.0
  browOffsetY: number; // -4 to +4 px
  mouthCurve: number; // -1.0 to +1.0
};

export type MoodPoint = {
  label: string;
  vitality: number; // 0..1
  energy: number; // 0..1
  expression: ExpressionParams;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpExpr(
  a: ExpressionParams,
  b: ExpressionParams,
  t: number,
): ExpressionParams {
  return {
    leafDroop: lerp(a.leafDroop, b.leafDroop, t),
    stemLean: lerp(a.stemLean, b.stemLean, t),
    colorSaturation: lerp(a.colorSaturation, b.colorSaturation, t),
    swayAmplitude: lerp(a.swayAmplitude, b.swayAmplitude, t),
    swayPeriod: lerp(a.swayPeriod, b.swayPeriod, t),
    eyeOpenness: lerp(a.eyeOpenness, b.eyeOpenness, t),
    browOffsetY: lerp(a.browOffsetY, b.browOffsetY, t),
    mouthCurve: lerp(a.mouthCurve, b.mouthCurve, t),
  };
}

/**
 * Bilinear blend across a 2D space of mood points.
 *
 * Uses inverse-distance weighting (IDW) with power=2, which generalises
 * cleanly to arbitrarily-placed points (unlike strict bilinear which
 * requires a grid). For N ≤ 6 mood points at 30 fps this is negligible CPU.
 */
export class BlendSpace2D {
  private points: MoodPoint[];

  constructor(points: MoodPoint[]) {
    if (points.length < 2)
      throw new Error("BlendSpace2D requires at least 2 mood points");
    this.points = points;
  }

  sample(vitality: number, energy: number): ExpressionParams {
    // Check for exact match first (avoids divide-by-zero in IDW)
    for (const p of this.points) {
      if (p.vitality === vitality && p.energy === energy) {
        return { ...p.expression };
      }
    }

    // Inverse-distance weighting, power = 2
    let weightSum = 0;
    const weights = this.points.map((p) => {
      const dx = p.vitality - vitality;
      const dy = p.energy - energy;
      const distSq = dx * dx + dy * dy;
      const w = 1 / distSq;
      weightSum += w;
      return w;
    });

    const result: ExpressionParams = {
      leafDroop: 0,
      stemLean: 0,
      colorSaturation: 0,
      swayAmplitude: 0,
      swayPeriod: 0,
      eyeOpenness: 0,
      browOffsetY: 0,
      mouthCurve: 0,
    };

    for (let i = 0; i < this.points.length; i++) {
      const t = weights[i] / weightSum;
      const expr = this.points[i].expression;
      result.leafDroop += expr.leafDroop * t;
      result.stemLean += expr.stemLean * t;
      result.colorSaturation += expr.colorSaturation * t;
      result.swayAmplitude += expr.swayAmplitude * t;
      result.swayPeriod += expr.swayPeriod * t;
      result.eyeOpenness += expr.eyeOpenness * t;
      result.browOffsetY += expr.browOffsetY * t;
      result.mouthCurve += expr.mouthCurve * t;
    }

    return result;
  }

  // Exposed for tests — not needed by the brain
  lerpTwo(
    a: ExpressionParams,
    b: ExpressionParams,
    t: number,
  ): ExpressionParams {
    return lerpExpr(a, b, t);
  }
}
