// © CoreConduit Consulting Services — MIT License
import { describe, it, expect, vi } from "vitest";
import { StateMachine } from "./stateMachine";

describe("StateMachine", () => {
  it("starts in Idle by default", () => {
    const sm = new StateMachine();
    expect(sm.state).toBe("Idle");
  });

  it("travel() to an adjacent state fires handler once", () => {
    const sm = new StateMachine("Idle");
    const handler = vi.fn();
    sm.onStateChange(handler);
    sm.travel("Listening");
    expect(sm.state).toBe("Listening");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith("Idle", "Listening");
  });

  it("travel() to current state is a no-op", () => {
    const sm = new StateMachine("Idle");
    const handler = vi.fn();
    sm.onStateChange(handler);
    sm.travel("Idle");
    expect(handler).not.toHaveBeenCalled();
  });

  it("travel() walks intermediate states (A → B → C)", () => {
    const sm = new StateMachine("Listening");
    const calls: string[] = [];
    sm.onStateChange((from, to) => calls.push(`${from}→${to}`));
    // Listening → Thinking requires going Listening→Thinking (direct edge)
    sm.travel("Thinking");
    expect(sm.state).toBe("Thinking");
    expect(calls.at(-1)).toBe("Listening→Thinking");
  });

  it("travel() to Distressed is reachable from any state", () => {
    for (const start of ["Idle", "Sleeping", "Talking", "Sprouting"] as const) {
      const sm = new StateMachine(start);
      sm.travel("Distressed");
      expect(sm.state).toBe("Distressed");
    }
  });

  it("travel() to an unreachable state teleports directly", () => {
    // Sprouting → Talking has no path; should teleport
    const sm = new StateMachine("Sprouting");
    sm.travel("Talking");
    expect(sm.state).toBe("Talking");
  });

  it("onStateChange unsubscribe stops future notifications", () => {
    const sm = new StateMachine("Idle");
    const handler = vi.fn();
    const unsub = sm.onStateChange(handler);
    unsub();
    sm.travel("Listening");
    expect(handler).not.toHaveBeenCalled();
  });

  it("forceState() bypasses path and fires handler", () => {
    const sm = new StateMachine("Sleeping");
    const handler = vi.fn();
    sm.onStateChange(handler);
    sm.forceState("Talking");
    expect(sm.state).toBe("Talking");
    expect(handler).toHaveBeenCalledWith("Sleeping", "Talking");
  });
});
