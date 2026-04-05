import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "./uuid";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("randomUUID", () => {
  it("returns a valid UUID v4 format", () => {
    const id = randomUUID();
    expect(id).toMatch(UUID_V4_RE);
  });

  it("uses crypto.randomUUID when available", () => {
    const fixed = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const spy = vi.fn().mockReturnValue(fixed);
    const original = globalThis.crypto.randomUUID;
    (globalThis.crypto as any).randomUUID = spy;

    const result = randomUUID();
    expect(spy).toHaveBeenCalled();
    expect(result).toBe(fixed);

    (globalThis.crypto as any).randomUUID = original;
  });

  it("falls back gracefully when crypto.randomUUID is missing", () => {
    const original = globalThis.crypto.randomUUID;
    (globalThis.crypto as any).randomUUID = undefined;

    const id = randomUUID();
    expect(id).toMatch(UUID_V4_RE);

    (globalThis.crypto as any).randomUUID = original;
  });

  it("sets UUID version bit to 4 in fallback path", () => {
    const original = globalThis.crypto.randomUUID;
    (globalThis.crypto as any).randomUUID = undefined;

    const id = randomUUID();
    // 13th character (position 14 with hyphens) must be '4'
    expect(id.charAt(14)).toBe("4");

    (globalThis.crypto as any).randomUUID = original;
  });

  it("sets variant bits correctly in fallback path (8, 9, a, or b)", () => {
    const original = globalThis.crypto.randomUUID;
    (globalThis.crypto as any).randomUUID = undefined;

    const id = randomUUID();
    // 17th character (position 19 with hyphens) must be 8, 9, a, or b
    expect(["8", "9", "a", "b"]).toContain(id.charAt(19));

    (globalThis.crypto as any).randomUUID = original;
  });

  it("produces unique IDs across many calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => randomUUID()));
    expect(ids.size).toBe(1000);
  });
});
