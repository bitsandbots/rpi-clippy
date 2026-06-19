// © CoreConduit Consulting Services — MIT License
import { describe, it, expect, vi } from "vitest";
import { SignalBus } from "./signals";

describe("SignalBus", () => {
  it("delivers a typed signal to a registered handler", () => {
    const bus = new SignalBus();
    const handler = vi.fn();
    bus.on("MESSAGE_SENT", handler);
    bus.emit({ type: "MESSAGE_SENT" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not deliver to handlers for other signal types", () => {
    const bus = new SignalBus();
    const handler = vi.fn();
    bus.on("MESSAGE_ERROR", handler);
    bus.emit({ type: "MESSAGE_SENT" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers to multiple handlers registered for the same type", () => {
    const bus = new SignalBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("INPUT_START", a);
    bus.on("INPUT_START", b);
    bus.emit({ type: "INPUT_START" });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("stops delivering after off() is called", () => {
    const bus = new SignalBus();
    const handler = vi.fn();
    bus.on("INPUT_STOP", handler);
    bus.off("INPUT_STOP", handler);
    bus.emit({ type: "INPUT_STOP" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function from on()", () => {
    const bus = new SignalBus();
    const handler = vi.fn();
    const unsub = bus.on("TTS_STOP", handler);
    unsub();
    bus.emit({ type: "TTS_STOP" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes signal payload to handler", () => {
    const bus = new SignalBus();
    const handler = vi.fn();
    bus.on("STATUS_CHANGE", handler);
    bus.emit({ type: "STATUS_CHANGE", status: "thinking" });
    expect(handler).toHaveBeenCalledWith({
      type: "STATUS_CHANGE",
      status: "thinking",
    });
  });

  it("clear() removes all handlers", () => {
    const bus = new SignalBus();
    const handler = vi.fn();
    bus.on("MESSAGE_SENT", handler);
    bus.clear();
    bus.emit({ type: "MESSAGE_SENT" });
    expect(handler).not.toHaveBeenCalled();
  });
});
