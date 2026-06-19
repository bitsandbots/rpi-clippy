// © CoreConduit Consulting Services — MIT License
import { describe, it, expect } from "vitest";
import { BlendSpace2D, type MoodPoint } from "./blendSpace";

const makePoint = (
  label: string,
  vitality: number,
  energy: number,
  mouthCurve: number,
): MoodPoint => ({
  label,
  vitality,
  energy,
  expression: {
    leafDroop: 0,
    stemLean: 0,
    colorSaturation: 1,
    swayAmplitude: 0,
    swayPeriod: 3000,
    eyeOpenness: 1,
    browOffsetY: 0,
    mouthCurve,
  },
});

describe("BlendSpace2D", () => {
  it("throws with fewer than 2 points", () => {
    expect(() => new BlendSpace2D([makePoint("a", 0, 0, 0)])).toThrow();
  });

  it("returns exact expression when sampled at a defined point", () => {
    const p = makePoint("happy", 1, 1, 1);
    const space = new BlendSpace2D([p, makePoint("sad", 0, 0, -1)]);
    const result = space.sample(1, 1);
    expect(result.mouthCurve).toBeCloseTo(1, 5);
  });

  it("blends toward negative mouthCurve at (0,0)", () => {
    const space = new BlendSpace2D([
      makePoint("happy", 1, 1, 1),
      makePoint("sad", 0, 0, -1),
    ]);
    const result = space.sample(0, 0);
    expect(result.mouthCurve).toBeCloseTo(-1, 5);
  });

  it("midpoint blend is between the two extremes", () => {
    const space = new BlendSpace2D([
      makePoint("happy", 1, 1, 1),
      makePoint("sad", 0, 0, -1),
    ]);
    const result = space.sample(0.5, 0.5);
    expect(result.mouthCurve).toBeGreaterThan(-1);
    expect(result.mouthCurve).toBeLessThan(1);
  });

  it("blends correctly with three points", () => {
    const space = new BlendSpace2D([
      makePoint("a", 0, 0, -1),
      makePoint("b", 1, 0, 0),
      makePoint("c", 0, 1, 1),
    ]);
    // At (1,0) should be close to point b (mouthCurve=0)
    const result = space.sample(1, 0);
    expect(result.mouthCurve).toBeCloseTo(0, 1);
  });

  it("lerpTwo interpolates all fields linearly", () => {
    const space = new BlendSpace2D([
      makePoint("a", 0, 0, 0),
      makePoint("b", 1, 1, 1),
    ]);
    const a = makePoint("a", 0, 0, 0).expression;
    const b = { ...a, leafDroop: 40, eyeOpenness: 0.2 };
    const mid = space.lerpTwo(a, b, 0.5);
    expect(mid.leafDroop).toBeCloseTo(20);
    expect(mid.eyeOpenness).toBeCloseTo(0.6);
  });
});
