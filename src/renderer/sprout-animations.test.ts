import { describe, it, expect } from "vitest";
import { SPROUT_ANIMATIONS } from "./sprout-animations";

describe("SPROUT_ANIMATIONS", () => {
  const entries = Object.entries(SPROUT_ANIMATIONS);

  it("has at least one animation", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("Default animation exists", () => {
    expect(SPROUT_ANIMATIONS.Default).toBeDefined();
  });

  it("every animation has a non-empty src", () => {
    for (const [key, anim] of entries) {
      expect(anim.src, `${key}.src`).toBeTruthy();
      expect(typeof anim.src, `${key}.src type`).toBe("string");
    }
  });

  it("every animation has a non-negative length", () => {
    for (const [key, anim] of entries) {
      expect(anim.length, `${key}.length`).toBeGreaterThanOrEqual(0);
    }
  });

  it("contains idle animations", () => {
    const idleKeys = Object.keys(SPROUT_ANIMATIONS).filter((k) =>
      k.startsWith("Idle"),
    );
    expect(idleKeys.length).toBeGreaterThanOrEqual(4);
  });

  it("contains gesture animations", () => {
    expect(SPROUT_ANIMATIONS.GestureLeft).toBeDefined();
    expect(SPROUT_ANIMATIONS.GestureRight).toBeDefined();
    expect(SPROUT_ANIMATIONS.GestureUp).toBeDefined();
    expect(SPROUT_ANIMATIONS.GestureDown).toBeDefined();
  });

  it("contains look animations", () => {
    expect(SPROUT_ANIMATIONS.LookLeft).toBeDefined();
    expect(SPROUT_ANIMATIONS.LookRight).toBeDefined();
    expect(SPROUT_ANIMATIONS.LookUp).toBeDefined();
    expect(SPROUT_ANIMATIONS.LookDown).toBeDefined();
  });

  it("lengths are plausible (between 0 and 30 seconds)", () => {
    for (const [key, anim] of entries) {
      expect(anim.length, `${key}.length`).toBeLessThanOrEqual(30_000);
    }
  });

});
