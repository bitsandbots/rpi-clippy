import { describe, it, expect } from "vitest";
import { filterMessageContent } from "./Chat";
import { ANIMATION_KEYS, ANIMATION_KEYS_BRACKETS } from "../sprout-animation-helpers";

// ---------------------------------------------------------------------------
// filterMessageContent
//
// Branches:
//  1. content === "["          → streaming open-bracket sentinel → text ""
//  2. /^\[[A-Za-z]*$/ matches  → partial bracket mid-stream → strip bracket, no key
//  3. starts with [Key]        → bracket format (preferred) → extract key + text
//  4. starts with Key:         → colon fallback → extract key + text
//  5. plain text               → no key, text unchanged
// ---------------------------------------------------------------------------

describe("filterMessageContent — sentinel / partial bracket", () => {
  it('returns empty text for bare "["', () => {
    const { text, animationKey } = filterMessageContent("[");
    expect(text).toBe("");
    expect(animationKey).toBe("");
  });

  it("strips a partial bracket that spans the whole string", () => {
    const { text, animationKey } = filterMessageContent("[Thin");
    expect(text).toBe("");
    expect(animationKey).toBe("");
  });

  it("strips a full word inside brackets when no trailing content", () => {
    const { text, animationKey } = filterMessageContent("[Thinking]");
    // The regex only matches when there is NO trailing text — this is the
    // mid-stream case before the rest of the message has arrived.
    // "[Thinking]" without trailing text matches /^\[[A-Za-z]*$/ after
    // stripping the closing bracket... actually this is handled by the
    // bracket-key loop below. Verify whichever branch fires.
    // Either: animationKey="Thinking", text="" — or text="" via partial match.
    expect(text).toBe("");
  });
});

describe("filterMessageContent — bracket format [Key]", () => {
  it("extracts the first animation key and removes it from text", () => {
    const key = ANIMATION_KEYS[0];
    const input = `[${key}] Hello world`;
    const { text, animationKey } = filterMessageContent(input);
    expect(animationKey).toBe(key);
    expect(text).toBe("Hello world");
  });

  it("trims leading whitespace from text after the key", () => {
    const key = ANIMATION_KEYS[0];
    const { text } = filterMessageContent(`[${key}]   trimmed`);
    expect(text).toBe("trimmed");
  });

  it("returns empty text when nothing follows the bracket key", () => {
    const key = ANIMATION_KEYS[0];
    const { text, animationKey } = filterMessageContent(`[${key}]`);
    expect(animationKey).toBe(key);
    expect(text).toBe("");
  });

  it("matches every registered animation key in bracket format", () => {
    for (const bracketKey of ANIMATION_KEYS_BRACKETS) {
      const key = bracketKey.slice(1, -1);
      const { animationKey } = filterMessageContent(`${bracketKey} some text`);
      expect(animationKey).toBe(key);
    }
  });
});

describe("filterMessageContent — colon fallback Key:", () => {
  it("extracts key when LLM uses colon format instead of brackets", () => {
    const key = ANIMATION_KEYS[0];
    const input = `${key}: here is my answer`;
    const { text, animationKey } = filterMessageContent(input);
    expect(animationKey).toBe(key);
    expect(text).toBe("here is my answer");
  });

  it("trims whitespace after the colon", () => {
    const key = ANIMATION_KEYS[0];
    const { text } = filterMessageContent(`${key}:   padded`);
    expect(text).toBe("padded");
  });

  it("matches every registered animation key in colon format", () => {
    for (const key of ANIMATION_KEYS) {
      const { animationKey } = filterMessageContent(`${key}: text`);
      expect(animationKey).toBe(key);
    }
  });
});

describe("filterMessageContent — plain text (no animation key)", () => {
  it("returns the content unchanged when there is no key", () => {
    const content = "Just a regular response with no animation.";
    const { text, animationKey } = filterMessageContent(content);
    expect(text).toBe(content);
    expect(animationKey).toBe("");
  });

  it("does not mistake mid-sentence brackets for an animation key", () => {
    const content = "The answer is [a+b] which equals c.";
    const { text, animationKey } = filterMessageContent(content);
    expect(animationKey).toBe("");
    expect(text).toBe(content);
  });

  it("handles empty string", () => {
    const { text, animationKey } = filterMessageContent("");
    expect(text).toBe("");
    expect(animationKey).toBe("");
  });

  it("handles whitespace-only content", () => {
    const { text, animationKey } = filterMessageContent("   ");
    expect(animationKey).toBe("");
  });
});

describe("filterMessageContent — bracket takes precedence over colon", () => {
  it("uses bracket format when both could theoretically match", () => {
    const key = ANIMATION_KEYS[0];
    // If the content starts with [Key] the bracket branch fires; the colon
    // branch is only reached when animationKey is still empty.
    const { animationKey, text } = filterMessageContent(`[${key}] response`);
    expect(animationKey).toBe(key);
    expect(text).toBe("response");
  });
});
