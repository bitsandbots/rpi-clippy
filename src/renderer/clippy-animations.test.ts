import { describe, it, expect } from "vitest";
import { ANIMATIONS } from "./clippy-animations";

describe("ANIMATIONS", () => {
  const entries = Object.entries(ANIMATIONS);

  it("has at least one animation", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("Default animation exists", () => {
    expect(ANIMATIONS.Default).toBeDefined();
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
    const idleKeys = Object.keys(ANIMATIONS).filter((k) => k.startsWith("Idle"));
    expect(idleKeys.length).toBeGreaterThanOrEqual(4);
  });

  it("contains gesture animations", () => {
    expect(ANIMATIONS.GestureLeft).toBeDefined();
    expect(ANIMATIONS.GestureRight).toBeDefined();
    expect(ANIMATIONS.GestureUp).toBeDefined();
    expect(ANIMATIONS.GestureDown).toBeDefined();
  });

  it("contains look animations", () => {
    expect(ANIMATIONS.LookLeft).toBeDefined();
    expect(ANIMATIONS.LookRight).toBeDefined();
    expect(ANIMATIONS.LookUp).toBeDefined();
    expect(ANIMATIONS.LookDown).toBeDefined();
  });

  it("lengths are plausible (between 0 and 30 seconds)", () => {
    for (const [key, anim] of entries) {
      expect(anim.length, `${key}.length`).toBeLessThanOrEqual(30_000);
    }
  });
});
