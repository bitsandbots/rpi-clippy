import { describe, it, expect } from "vitest";
import {
  mapGardenState,
  isDistressedAlert,
  alertToAriaText,
  MOISTURE_CRITICAL,
  RESERVOIR_EMPTY,
  HEALTH_MILESTONE,
} from "./gardenMapping";
import type { GardenState, GardenAlert } from "../engine/signals";

// ---------------------------------------------------------------------------
// gardenMapping — the data layer that turns a normalized hydroMazing
// GardenState into a mood target + one-shot reaction list. Pure functions,
// no engine/signal-bus side effects. CLAUDE.md flags the garden field mapping
// as a deploy-time gotcha, so the threshold branches are exercised explicitly.
// ---------------------------------------------------------------------------

/** A healthy, fully-watered baseline; tests override only the fields under test. */
function baseState(overrides: Partial<GardenState> = {}): GardenState {
  return {
    ts: 0,
    health_score: 0.8,
    moisture: 0.5,
    temp_c: 21,
    temp_comfort: 0.9,
    humidity: 0.5,
    light: 0.6,
    water_level: 0.9,
    pump_active: false,
    last_event: "none",
    alerts: [],
    ...overrides,
  };
}

describe("mapGardenState — moodTarget", () => {
  it("uses health_score as vitality when present", () => {
    const { moodTarget } = mapGardenState(
      baseState({ health_score: 0.7 }),
      0.2,
    );
    expect(moodTarget.vitality).toBe(0.7);
  });

  it("falls back to prevVitality when health_score is missing", () => {
    // health_score is non-nullable in the type, but the impl guards with ?? for
    // partial payloads; simulate that by casting an undefined through.
    const state = baseState();
    (state as { health_score: number | undefined }).health_score = undefined;
    const { moodTarget } = mapGardenState(state, 0.42);
    expect(moodTarget.vitality).toBe(0.42);
  });

  it("derives energy from light and clamps into [0,1]", () => {
    expect(
      mapGardenState(baseState({ light: 0.3 }), 0.5).moodTarget.energy,
    ).toBe(0.3);
    expect(mapGardenState(baseState({ light: 5 }), 0.5).moodTarget.energy).toBe(
      1,
    );
    expect(
      mapGardenState(baseState({ light: -2 }), 0.5).moodTarget.energy,
    ).toBe(0);
  });

  it("defaults energy to 0.5 when light is null", () => {
    const { moodTarget } = mapGardenState(baseState({ light: null }), 0.5);
    expect(moodTarget.energy).toBe(0.5);
  });
});

describe("mapGardenState — reactions", () => {
  it("fires 'concern' when moisture is below the critical threshold", () => {
    const { reactions } = mapGardenState(
      baseState({ moisture: MOISTURE_CRITICAL - 0.01 }),
      0.8,
    );
    expect(reactions.map((r) => r.key)).toContain("concern");
  });

  it("does not fire 'concern' at or above the moisture threshold", () => {
    const { reactions } = mapGardenState(
      baseState({ moisture: MOISTURE_CRITICAL }),
      0.8,
    );
    expect(reactions.map((r) => r.key)).not.toContain("concern");
  });

  it("ignores moisture entirely when it is null", () => {
    const { reactions } = mapGardenState(baseState({ moisture: null }), 0.8);
    expect(reactions.map((r) => r.key)).not.toContain("concern");
  });

  it("fires 'sip' when the pump runs while vitality is low", () => {
    const { reactions } = mapGardenState(
      baseState({ pump_active: true }),
      0.3, // below VITALITY_LOW_FOR_SIP (0.5)
    );
    expect(reactions.map((r) => r.key)).toContain("sip");
  });

  it("does not fire 'sip' when the pump runs but vitality is already high", () => {
    const { reactions } = mapGardenState(baseState({ pump_active: true }), 0.8);
    expect(reactions.map((r) => r.key)).not.toContain("sip");
  });

  it("fires 'grow-leaf' when vitality crosses the milestone upward", () => {
    const { reactions } = mapGardenState(
      baseState({ health_score: HEALTH_MILESTONE }),
      HEALTH_MILESTONE - 0.05,
    );
    expect(reactions.map((r) => r.key)).toContain("grow-leaf");
  });

  it("does not re-fire 'grow-leaf' once already above the milestone", () => {
    const { reactions } = mapGardenState(
      baseState({ health_score: 0.95 }),
      0.92, // already past the milestone last frame
    );
    expect(reactions.map((r) => r.key)).not.toContain("grow-leaf");
  });

  it("stacks multiple reactions in one frame", () => {
    const { reactions } = mapGardenState(
      baseState({
        moisture: 0.05,
        pump_active: true,
        health_score: HEALTH_MILESTONE,
      }),
      0.3,
    );
    const keys = reactions.map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining(["concern", "sip", "grow-leaf"]),
    );
  });

  it("returns no reactions for a steady, healthy state", () => {
    expect(mapGardenState(baseState(), 0.8).reactions).toHaveLength(0);
  });
});

describe("mapGardenState — distressed", () => {
  it("marks distressed when the reservoir is below empty threshold", () => {
    expect(
      mapGardenState(baseState({ water_level: RESERVOIR_EMPTY - 0.01 }), 0.8)
        .distressed,
    ).toBe(true);
  });

  it("is not distressed at or above the reservoir threshold", () => {
    expect(
      mapGardenState(baseState({ water_level: RESERVOIR_EMPTY }), 0.8)
        .distressed,
    ).toBe(false);
  });

  it("ignores water_level when it is null", () => {
    expect(
      mapGardenState(baseState({ water_level: null }), 0.8).distressed,
    ).toBe(false);
  });
});

describe("isDistressedAlert", () => {
  const alert = (severity: GardenAlert["severity"]): GardenAlert => ({
    id: "a1",
    severity,
    text: "x",
  });

  it("treats error-severity alerts as distress", () => {
    expect(isDistressedAlert(alert("error"))).toBe(true);
  });

  it("does not treat warnings as distress", () => {
    expect(isDistressedAlert(alert("warn"))).toBe(false);
  });
});

describe("alertToAriaText", () => {
  it("prefixes the alert text and uses assertive for errors", () => {
    const out = alertToAriaText({
      id: "a1",
      severity: "error",
      text: "Reservoir empty",
    });
    expect(out.text).toBe("Garden alert: Reservoir empty");
    expect(out.level).toBe("assertive");
  });

  it("uses polite live-region level for warnings", () => {
    const out = alertToAriaText({
      id: "a2",
      severity: "warn",
      text: "Low light",
    });
    expect(out.text).toBe("Garden alert: Low light");
    expect(out.level).toBe("polite");
  });
});
