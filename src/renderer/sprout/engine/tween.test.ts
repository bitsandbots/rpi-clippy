// © CoreConduit Consulting Services — MIT License
import { describe, it, expect, vi } from "vitest";
import { Tween, easings } from "./tween";

describe("easings", () => {
  it("linear maps 0→0 and 1→1", () => {
    expect(easings.linear(0)).toBe(0);
    expect(easings.linear(1)).toBe(1);
  });

  it("easeInOutQuad maps 0→0 and 1→1", () => {
    expect(easings.easeInOutQuad(0)).toBe(0);
    expect(easings.easeInOutQuad(1)).toBe(1);
  });

  it("spring settles near 1 at t=1", () => {
    expect(easings.spring(1)).toBeCloseTo(1, 2);
  });

  it("spring overshoots between t=0 and t=1", () => {
    const values = [0.1, 0.2, 0.3, 0.4, 0.5].map(easings.spring);
    expect(values.some((v) => v > 1)).toBe(true);
  });
});

describe("Tween", () => {
  it("starts at `from` and ends at `to`", () => {
    const tween = new Tween({ from: 0, to: 100, durationMs: 1000 });
    expect(tween.currentValue()).toBe(0);
    tween.advance(1000);
    expect(tween.currentValue()).toBe(100);
  });

  it("interpolates midpoint with linear easing", () => {
    const tween = new Tween({
      from: 0,
      to: 100,
      durationMs: 1000,
      easing: easings.linear,
    });
    tween.advance(500);
    expect(tween.currentValue()).toBeCloseTo(50, 1);
  });

  it("clamps at `to` after duration exceeded", () => {
    const tween = new Tween({
      from: 0,
      to: 50,
      durationMs: 500,
      easing: easings.linear,
    });
    tween.advance(1000);
    expect(tween.currentValue()).toBe(50);
    expect(tween.isComplete).toBe(true);
  });

  it("calls onUpdate each advance", () => {
    const onUpdate = vi.fn();
    const tween = new Tween({ from: 0, to: 10, durationMs: 100, onUpdate });
    tween.advance(50);
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it("calls onComplete exactly once when done", () => {
    const onComplete = vi.fn();
    const tween = new Tween({ from: 0, to: 10, durationMs: 100, onComplete });
    tween.advance(50);
    tween.advance(60);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("does not advance past completion", () => {
    const onUpdate = vi.fn();
    const tween = new Tween({ from: 0, to: 10, durationMs: 100, onUpdate });
    tween.advance(200);
    tween.advance(200); // already done
    expect(onUpdate).toHaveBeenCalledOnce(); // only fires on the advancing call
  });

  it("returns `to` from advance() when complete", () => {
    const tween = new Tween({
      from: 0,
      to: 42,
      durationMs: 100,
      easing: easings.linear,
    });
    tween.advance(200);
    expect(tween.advance(100)).toBe(42);
  });
});
