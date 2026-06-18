import { describe, it, expect } from "vitest";
import { getStatusText } from "./StatusBar";

describe("getStatusText", () => {
  it('returns "Loading model..." when model is not loaded regardless of status', () => {
    expect(getStatusText("idle", false)).toBe("Loading model...");
    expect(getStatusText("thinking", false)).toBe("Loading model...");
    expect(getStatusText("responding", false)).toBe("Loading model...");
    expect(getStatusText("welcome", false)).toBe("Loading model...");
  });

  it('returns "Thinking..." when status is thinking and model loaded', () => {
    expect(getStatusText("thinking", true)).toBe("Thinking...");
  });

  it('returns "Responding..." when status is responding and model loaded', () => {
    expect(getStatusText("responding", true)).toBe("Responding...");
  });

  it('returns "Welcome!" when status is welcome and model loaded', () => {
    expect(getStatusText("welcome", true)).toBe("Welcome!");
  });

  it('returns "Ready" for idle status when model loaded', () => {
    expect(getStatusText("idle", true)).toBe("Ready");
  });

  it('returns "Ready" for any unknown status when model loaded', () => {
    expect(getStatusText("unknown-status", true)).toBe("Ready");
    expect(getStatusText("", true)).toBe("Ready");
  });
});
