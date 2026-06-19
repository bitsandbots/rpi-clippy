import { describe, it, expect } from "vitest";
import { CHARACTERS, DEFAULT_CHARACTER } from "./character-animations";
import { SPROUT_ANIMATIONS } from "./sprout-classic-animations";

describe("CHARACTERS", () => {
  it("has a reactive Sprout character", () => {
    expect(CHARACTERS.sprout).toBeDefined();
    expect(CHARACTERS.sprout.name).toBe("Sprout");
    expect(CHARACTERS.sprout.reactive).toBe(true);
    expect(CHARACTERS.sprout.animations).toEqual({});
  });

  it("has a sprout-classic character with sprite animations", () => {
    expect(CHARACTERS["sprout-classic"]).toBeDefined();
    expect(CHARACTERS["sprout-classic"].name).toBe("Sprout (Classic)");
    expect(CHARACTERS["sprout-classic"].reactive).toBe(false);
    expect(CHARACTERS["sprout-classic"].animations).toBe(SPROUT_ANIMATIONS);
  });

  it("sprout-classic has animation entries", () => {
    expect(
      Object.keys(CHARACTERS["sprout-classic"].animations).length,
    ).toBeGreaterThan(0);
  });

  it("sprout-classic has a Default animation", () => {
    expect(CHARACTERS["sprout-classic"].animations.Default).toBeDefined();
  });

  it("default character is sprout", () => {
    expect(DEFAULT_CHARACTER).toBe("sprout");
  });
});
