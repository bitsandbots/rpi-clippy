import { describe, it, expect } from "vitest";
import { CHARACTERS, DEFAULT_CHARACTER } from "./character-animations";

describe("CHARACTERS", () => {
  it("has a reactive Sprout character", () => {
    expect(CHARACTERS.sprout).toBeDefined();
    expect(CHARACTERS.sprout.name).toBe("Sprout");
    expect(CHARACTERS.sprout.reactive).toBe(true);
  });

  it("has exactly one (reactive) character", () => {
    expect(Object.keys(CHARACTERS)).toEqual(["sprout"]);
  });

  it("default character is sprout", () => {
    expect(DEFAULT_CHARACTER).toBe("sprout");
  });
});
