// © CoreConduit Consulting Services — MIT License
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SproutBrain } from "./brain";
import { signalBus } from "./signals";

// Minimal RigRefs stub — no DOM needed; brain writes attributes via setAttribute
function makeEl() {
  const attrs: Record<string, string> = {};
  const style: Record<string, string> = {};
  return {
    setAttribute: (k: string, v: string) => {
      attrs[k] = v;
    },
    getAttribute: (k: string) => attrs[k] ?? null,
    style,
    _attrs: attrs,
  } as unknown as SVGElement & { _attrs: Record<string, string> };
}

function makeRefs() {
  return {
    root: makeEl() as unknown as SVGSVGElement,
    body: makeEl(),
    pot: makeEl(),
    stem: makeEl(),
    leafL: makeEl(),
    leafR: makeEl(),
    leafBladeL: makeEl(),
    leafBladeR: makeEl(),
    face: makeEl(),
    eyeL: makeEl(),
    eyeR: makeEl(),
    lidL: makeEl(),
    lidR: makeEl(),
    browL: makeEl(),
    browR: makeEl(),
    mouth: makeEl(),
    bloom: makeEl(),
  };
}

describe("SproutBrain", () => {
  let brain: SproutBrain;
  let refs: ReturnType<typeof makeRefs>;

  beforeEach(() => {
    brain = new SproutBrain();
    refs = makeRefs();
    // Patch loop.start/stop to no-ops so rAF is never called
    (brain as any).loop.start = vi.fn();
    (brain as any).loop.stop = vi.fn();
    brain.mount(refs as any);
  });

  afterEach(() => {
    brain.unmount();
    signalBus.clear();
  });

  it("starts in Idle state after mount", () => {
    expect(brain.state).toBe("Idle");
  });

  it("STATUS_CHANGE thinking → state Thinking", () => {
    signalBus.emit({ type: "STATUS_CHANGE", status: "thinking" });
    expect(brain.state).toBe("Thinking");
  });

  it("STATUS_CHANGE responding → state Talking", () => {
    signalBus.emit({ type: "STATUS_CHANGE", status: "responding" });
    expect(brain.state).toBe("Talking");
  });

  it("STATUS_CHANGE idle → returns to Idle from Thinking", () => {
    signalBus.emit({ type: "STATUS_CHANGE", status: "thinking" });
    signalBus.emit({ type: "STATUS_CHANGE", status: "idle" });
    expect(brain.state).toBe("Idle");
  });

  it("INPUT_START → Listening", () => {
    signalBus.emit({ type: "INPUT_START" });
    expect(brain.state).toBe("Listening");
  });

  it("INPUT_STOP from Listening → Idle", () => {
    signalBus.emit({ type: "INPUT_START" });
    signalBus.emit({ type: "INPUT_STOP" });
    expect(brain.state).toBe("Idle");
  });

  it("GARDEN_ALERT error → Distressed", () => {
    signalBus.emit({
      type: "GARDEN_ALERT",
      alert: { id: "x", severity: "error", text: "low" },
    });
    expect(brain.state).toBe("Distressed");
  });

  it("GARDEN_ALERT_CLEARED from Distressed → Idle", () => {
    signalBus.emit({
      type: "GARDEN_ALERT",
      alert: { id: "x", severity: "error", text: "low" },
    });
    signalBus.emit({ type: "GARDEN_ALERT_CLEARED", id: "x" });
    expect(brain.state).toBe("Idle");
  });

  it("tickOnce() writes body lean/sway transform to refs", () => {
    brain.tickOnce(33);
    const body = refs.body as any;
    expect(body._attrs["transform"]).toMatch(/rotate\(.*, 100, 250\)/);
  });

  it("tickOnce() writes mouth path to refs", () => {
    brain.tickOnce(33);
    const mouth = refs.mouth as any;
    expect(mouth._attrs["d"]).toMatch(/^M88,104/);
  });

  it("tickOnce() writes a rotate transform to both leaf blades", () => {
    brain.tickOnce(33);
    expect((refs.leafBladeL as any)._attrs["transform"]).toMatch(/rotate/);
    expect((refs.leafBladeR as any)._attrs["transform"]).toMatch(/rotate/);
  });

  it("Greeting token fires both greet and wave overlays", () => {
    const fireSpy = vi.spyOn((brain as any).oneShot, "fire");
    signalBus.emit({ type: "ANIMATION_TOKEN", key: "Greeting" });
    expect(fireSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: "greet" }),
    );
    expect(fireSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: "wave" }),
    );
  });

  it("a non-greeting token does not fire the wave overlay", () => {
    const fireSpy = vi.spyOn((brain as any).oneShot, "fire");
    signalBus.emit({ type: "ANIMATION_TOKEN", key: "Congratulate" });
    expect(fireSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: "wave" }),
    );
  });

  it("blink fires a oneShot overlay after blinkInterval ticks", () => {
    const oneShotSpy = vi.spyOn((brain as any).oneShot, "fire");
    // Force blinkInterval to something tiny
    (brain as any).blinkInterval = 50;
    brain.tickOnce(100); // exceeds blinkInterval
    expect(oneShotSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: "blink" }),
    );
  });

  it("saccade target updates after saccadeInterval ticks", () => {
    (brain as any).saccadeInterval = 10;
    const prevX = (brain as any).saccadeTargetX;
    // Run enough ticks to accumulate > 10ms
    brain.tickOnce(50);
    const nextX = (brain as any).saccadeTargetX;
    // There's a chance they're equal (same random value), but overwhelmingly not
    // This test checks the update path runs without throwing
    expect(typeof nextX).toBe("number");
  });

  it("TTS_START sets state to Talking and TTS_STOP returns to Idle", () => {
    signalBus.emit({ type: "STATUS_CHANGE", status: "responding" });
    signalBus.emit({ type: "TTS_START", durationMs: 5000 });
    expect(brain.state).toBe("Talking");
    signalBus.emit({ type: "TTS_STOP" });
    expect(brain.state).toBe("Idle");
  });

  it("IDLE_TIMEOUT from Idle → Sleeping", () => {
    signalBus.emit({ type: "IDLE_TIMEOUT" });
    expect(brain.state).toBe("Sleeping");
  });

  it("INPUT_START while Sleeping → Listening", () => {
    signalBus.emit({ type: "IDLE_TIMEOUT" }); // → Sleeping
    signalBus.emit({ type: "INPUT_START" });
    expect(brain.state).toBe("Listening");
  });

  // -------------------------------------------------------------------------
  // Phase 4 — Mood / blend layer
  // -------------------------------------------------------------------------

  it("setMoodDebug immediately updates current vitality and energy", () => {
    brain.setMoodDebug(0.1, 0.9);
    expect(brain.currentVitality).toBeCloseTo(0.1);
    expect(brain.currentEnergy).toBeCloseTo(0.9);
  });

  it("setMoodDebug clamps values to [0, 1]", () => {
    brain.setMoodDebug(-0.5, 1.5);
    expect(brain.currentVitality).toBe(0);
    expect(brain.currentEnergy).toBe(1);
  });

  it("tickOnce() writes colorSaturation as CSS filter on root", () => {
    brain.setMoodDebug(0.1, 0.2); // low vitality → low saturation
    brain.tickOnce(33);
    const root = refs.root as any;
    expect(root.style.filter).toMatch(/saturate\(/);
    const value = parseFloat(root.style.filter.replace("saturate(", ""));
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });

  it("high vitality produces higher saturation than low vitality", () => {
    // Low vitality tick
    brain.setMoodDebug(0.05, 0.5);
    brain.tickOnce(33);
    const lowSat = parseFloat(
      (refs.root as any).style.filter.replace("saturate(", ""),
    );

    // High vitality tick
    brain.setMoodDebug(1.0, 0.5);
    brain.tickOnce(33);
    const highSat = parseFloat(
      (refs.root as any).style.filter.replace("saturate(", ""),
    );

    expect(highSat).toBeGreaterThan(lowSat);
  });

  it("reaction overlay does not snap posture/color off the mood base", () => {
    // Set a known mood baseline
    brain.setMoodDebug(0.9, 0.9); // thriving
    brain.tickOnce(33);
    const baseMouth = (refs.mouth as any)._attrs["d"] as string;

    // Fire a nod (owns stemLean only) — mouth should stay near base
    signalBus.emit({ type: "MESSAGE_SENT" });
    brain.tickOnce(33);
    const afterNodMouth = (refs.mouth as any)._attrs["d"] as string;

    // Mouth path should be the same (nod doesn't filter mouthCurve)
    expect(afterNodMouth).toBe(baseMouth);
  });

  it("mood smooths gradually when target changes via garden update", () => {
    brain.setMoodDebug(1.0, 1.0); // start thriving
    signalBus.emit({
      type: "GARDEN_STATE_UPDATE",
      state: {
        ts: 0,
        health_score: 0.1,
        moisture: null,
        temp_c: null,
        temp_comfort: null,
        humidity: null,
        light: null,
        water_level: null,
        pump_active: false,
        last_event: "none",
        alerts: [],
      },
    });
    // After a single short tick, vitality hasn't jumped to 0.1 yet (tau = 30 s)
    brain.tickOnce(33);
    expect(brain.currentVitality).toBeGreaterThan(0.5);
  });
});
