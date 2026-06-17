import { describe, it, expect } from "vitest";
import { CHARACTERS, DEFAULT_CHARACTER } from "./character-animations";
import { ANIMATIONS } from "./clippy-animations";
import { SPROUT_ANIMATIONS } from "./sprout-animations";

describe("CHARACTERS", () => {
  it("has a Clippy character", () => {
    expect(CHARACTERS.clippy).toBeDefined();
    expect(CHARACTERS.clippy.name).toBe("Clippy");
    expect(CHARACTERS.clippy.animations).toBe(ANIMATIONS);
  });

  it("has a Sprout character", () => {
    expect(CHARACTERS.sprout).toBeDefined();
    expect(CHARACTERS.sprout.name).toBe("Sprout");
    expect(CHARACTERS.sprout.animations).toBe(SPROUT_ANIMATIONS);
  });

  it("default character is clippy", () => {
    expect(DEFAULT_CHARACTER).toBe("clippy");
  });

  it("every character has the same animation keys as Clippy", () => {
    const clippyKeys = Object.keys(CHARACTERS.clippy.animations).sort();
    for (const character of Object.values(CHARACTERS)) {
      expect(Object.keys(character.animations).sort()).toEqual(clippyKeys);
    }
  });
});
