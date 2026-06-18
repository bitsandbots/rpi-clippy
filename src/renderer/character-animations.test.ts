import { describe, it, expect } from "vitest";
import { CHARACTERS, DEFAULT_CHARACTER } from "./character-animations";
import { SPROUT_ANIMATIONS } from "./sprout-animations";

describe("CHARACTERS", () => {
  it("has a Sprout character", () => {
    expect(CHARACTERS.sprout).toBeDefined();
    expect(CHARACTERS.sprout.name).toBe("Sprout");
    expect(CHARACTERS.sprout.animations).toBe(SPROUT_ANIMATIONS);
  });

  it("default character is sprout", () => {
    expect(DEFAULT_CHARACTER).toBe("sprout");
  });

  it("sprout has animation entries", () => {
    expect(Object.keys(CHARACTERS.sprout.animations).length).toBeGreaterThan(0);
  });

  it("sprout has a Default animation", () => {
    expect(CHARACTERS.sprout.animations.Default).toBeDefined();
  });
});
