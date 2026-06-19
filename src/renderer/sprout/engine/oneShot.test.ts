// © CoreConduit Consulting Services — MIT License
import { describe, it, expect } from "vitest";
import { OneShotLayer, type OneShotDef } from "./oneShot";
import type { ExpressionParams } from "./blendSpace";

const BASE: ExpressionParams = {
  leafDroop: 0,
  leafTipCurl: 0,
  stemLean: 0,
  colorSaturation: 1,
  swayAmplitude: 3,
  swayPeriod: 3000,
  eyeOpenness: 1,
  browOffsetY: 0,
  mouthCurve: 0,
};

const NOD: OneShotDef = {
  key: "nod",
  durationMs: 600,
  filteredTracks: ["stemLean"],
  target: { stemLean: 8 },
};

const GREET: OneShotDef = {
  key: "greet",
  durationMs: 1200,
  filteredTracks: ["mouthCurve", "browOffsetY"],
  target: { mouthCurve: 1, browOffsetY: -3 },
};

describe("OneShotLayer", () => {
  it("hasActive is false before any overlay is fired", () => {
    const layer = new OneShotLayer();
    expect(layer.hasActive).toBe(false);
  });

  it("isActive reflects whether a specific key is playing", () => {
    const layer = new OneShotLayer();
    expect(layer.isActive("wave")).toBe(false);
    layer.fire({
      key: "wave",
      durationMs: 100,
      filteredTracks: ["leafTipCurl"],
      target: { leafTipCurl: -12 },
    });
    expect(layer.isActive("wave")).toBe(true);
    expect(layer.isActive("blink")).toBe(false);
    layer.advance(150); // expire it
    expect(layer.isActive("wave")).toBe(false);
  });

  it("hasActive is true after fire()", () => {
    const layer = new OneShotLayer();
    layer.fire(NOD);
    expect(layer.hasActive).toBe(true);
  });

  it("overlay expires after its duration", () => {
    const layer = new OneShotLayer();
    layer.fire(NOD);
    layer.advance(700); // > 600ms
    expect(layer.hasActive).toBe(false);
  });

  it("compose() returns base unchanged when no overlays active", () => {
    const layer = new OneShotLayer();
    expect(layer.compose(BASE)).toEqual(BASE);
  });

  it("compose() applies filtered track at peak (middle of duration)", () => {
    const layer = new OneShotLayer();
    layer.fire(NOD);
    layer.advance(300); // 50% through — envelope = 1 (peak)
    const result = layer.compose(BASE);
    expect(result.stemLean).toBeGreaterThan(BASE.stemLean);
    expect(result.stemLean).toBeLessThanOrEqual(8);
  });

  it("compose() does not touch unfiltered tracks", () => {
    const layer = new OneShotLayer();
    layer.fire(NOD);
    layer.advance(300);
    const result = layer.compose(BASE);
    // NOD only owns stemLean — everything else should be BASE values
    expect(result.mouthCurve).toBe(BASE.mouthCurve);
    expect(result.eyeOpenness).toBe(BASE.eyeOpenness);
  });

  it("two overlays compose without stomping each other's tracks", () => {
    const layer = new OneShotLayer();
    layer.fire(NOD); // owns stemLean
    layer.fire(GREET); // owns mouthCurve, browOffsetY
    layer.advance(300);
    const result = layer.compose(BASE);
    expect(result.stemLean).toBeGreaterThan(0);
    expect(result.mouthCurve).toBeGreaterThan(0);
  });

  it("firing same key interrupts previous overlay by default", () => {
    const layer = new OneShotLayer();
    layer.fire(NOD);
    layer.advance(200);
    layer.fire(NOD); // should restart, not stack
    layer.advance(0);
    // Only one NOD active
    const result = layer.compose(BASE);
    // stemLean at t=0 of new overlay: envelope near 0 → close to base
    expect(result.stemLean).toBeCloseTo(BASE.stemLean, 0);
  });

  it("clearAll() removes all active overlays", () => {
    const layer = new OneShotLayer();
    layer.fire(NOD);
    layer.fire(GREET);
    layer.clearAll();
    expect(layer.hasActive).toBe(false);
    expect(layer.compose(BASE)).toEqual(BASE);
  });
});
