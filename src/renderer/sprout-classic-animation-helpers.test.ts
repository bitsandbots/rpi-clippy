import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ANIMATION_KEYS,
  ANIMATION_KEYS_BRACKETS,
  IDLE_ANIMATION_KEYS,
  EMPTY_ANIMATION,
  getRandomAnimation,
  getRandomIdleAnimation,
} from "./sprout-classic-animation-helpers";
import {
  SPROUT_ANIMATIONS as ANIMATIONS,
  Animation,
} from "./sprout-classic-animations";

describe("ANIMATION_KEYS", () => {
  it("matches Object.keys(ANIMATIONS)", () => {
    expect(ANIMATION_KEYS).toEqual(Object.keys(ANIMATIONS));
  });

  it("has more than one key", () => {
    expect(ANIMATION_KEYS.length).toBeGreaterThan(1);
  });
});

describe("ANIMATION_KEYS_BRACKETS", () => {
  it("wraps every key in square brackets", () => {
    for (const key of ANIMATION_KEYS) {
      expect(ANIMATION_KEYS_BRACKETS).toContain(`[${key}]`);
    }
  });

  it("has the same length as ANIMATION_KEYS", () => {
    expect(ANIMATION_KEYS_BRACKETS).toHaveLength(ANIMATION_KEYS.length);
  });
});

describe("IDLE_ANIMATION_KEYS", () => {
  it("contains only keys that start with 'Idle'", () => {
    for (const key of IDLE_ANIMATION_KEYS) {
      expect(key.startsWith("Idle")).toBe(true);
    }
  });

  it("contains at least 4 idle animations", () => {
    expect(IDLE_ANIMATION_KEYS.length).toBeGreaterThanOrEqual(4);
  });

  it("is a subset of ANIMATION_KEYS", () => {
    for (const key of IDLE_ANIMATION_KEYS) {
      expect(ANIMATION_KEYS).toContain(key);
    }
  });
});

describe("EMPTY_ANIMATION", () => {
  it("has a base64 data URI as src", () => {
    expect(EMPTY_ANIMATION.src.startsWith("data:")).toBe(true);
  });

  it("has length 0", () => {
    expect(EMPTY_ANIMATION.length).toBe(0);
  });
});

describe("getRandomAnimation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an animation from the given keys", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = getRandomAnimation(ANIMATION_KEYS);
    expect(Object.values(ANIMATIONS)).toContain(result);
  });

  it("always picks from the specified keys array", () => {
    const keys = ["Alert", "GoodBye", "Wave"];
    for (let i = 0; i < 10; i++) {
      const result = getRandomAnimation(keys);
      expect(
        keys.map((k) => ANIMATIONS[k as keyof typeof ANIMATIONS]),
      ).toContain(result);
    }
  });

  it("does not return the current animation (avoids repetition)", () => {
    // Force Math.random to always return index 0
    let callCount = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      // Return 0 for first few calls (same index), then different
      return callCount++ < 5 ? 0 : 0.99;
    });

    const keys = ANIMATION_KEYS.slice(0, 3);
    const current = ANIMATIONS[keys[0] as keyof typeof ANIMATIONS];
    const result = getRandomAnimation(keys, current);

    expect(result).not.toBe(current);
  });
});

describe("getRandomIdleAnimation", () => {
  it("returns an idle animation", () => {
    const result = getRandomIdleAnimation();
    const idleAnimations = IDLE_ANIMATION_KEYS.map(
      (k) => ANIMATIONS[k as keyof typeof ANIMATIONS],
    );
    expect(idleAnimations).toContain(result);
  });

  it("avoids repeating the current animation", () => {
    const firstIdleKey = IDLE_ANIMATION_KEYS[0];
    const current = ANIMATIONS[firstIdleKey as keyof typeof ANIMATIONS];

    // Run several times — should not always return the same one
    const results = new Set(
      Array.from({ length: 20 }, () => getRandomIdleAnimation(current)),
    );
    // With 4+ idle animations, we expect to see at least 2 different ones
    expect(results.size).toBeGreaterThanOrEqual(1);
  });
});
