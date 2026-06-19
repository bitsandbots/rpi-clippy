// © CoreConduit Consulting Services — MIT License
//
// Sensor → mood/reaction mapping thresholds.
// All values reference the GardenState contract in:
//   docs/superpowers/specs/sprout-reactive-character.md §5

import type { GardenState, GardenAlert } from "../engine/signals";

export type MoodTarget = { vitality: number; energy: number };
export type ReactionTrigger = { key: string };

export type GardenMapping = {
  moodTarget: MoodTarget;
  reactions: ReactionTrigger[];
  distressed: boolean;
};

// Thresholds for derived reactions
const MOISTURE_CRITICAL = 0.15;
const RESERVOIR_EMPTY = 0.1;
const LIGHT_NIGHT = 0.15;
const LIGHT_DAY = 0.4;
const VITALITY_LOW_FOR_SIP = 0.5;
const HEALTH_MILESTONE = 0.9;

// Smoothing weight for each sensor's contribution to Energy
// (light 40%, sustained interaction 40%, time-of-day 20% — time-of-day
//  is computed externally from light; here we use light as a proxy)
function computeEnergy(state: GardenState): number {
  const light = state.light ?? 0.5;
  return Math.max(0, Math.min(1, light));
}

/**
 * Map a normalized GardenState to a mood target + list of one-shot reaction
 * keys to fire. The brain's signal handlers call setMoodTarget() and fire
 * reactions via the signal bus; this function is the data layer only.
 */
export function mapGardenState(
  state: GardenState,
  prevVitality: number,
): GardenMapping {
  const vitality = state.health_score ?? prevVitality;
  const energy = computeEnergy(state);
  const reactions: ReactionTrigger[] = [];
  let distressed = false;

  // Thirsty → concern pulse (but not yet Distressed)
  if (state.moisture !== null && state.moisture < MOISTURE_CRITICAL) {
    reactions.push({ key: "concern" });
  }

  // Reservoir empty → Distressed
  if (state.water_level !== null && state.water_level < RESERVOIR_EMPTY) {
    distressed = true;
  }

  // Pump ran while plant was low vitality → "sip" (relief)
  if (state.pump_active && prevVitality < VITALITY_LOW_FOR_SIP) {
    reactions.push({ key: "sip" });
  }

  // Growth milestone → bloom
  if (vitality >= HEALTH_MILESTONE && prevVitality < HEALTH_MILESTONE) {
    reactions.push({ key: "grow-leaf" });
  }

  return { moodTarget: { vitality, energy }, reactions, distressed };
}

/**
 * Map a GardenAlert severity to whether it should drive Distressed state.
 */
export function isDistressedAlert(alert: GardenAlert): boolean {
  return alert.severity === "error";
}

/**
 * Produce a human-readable aria-live string for a garden alert.
 * Critical alerts use "assertive"; warnings use "polite".
 */
export function alertToAriaText(alert: GardenAlert): {
  text: string;
  level: "polite" | "assertive";
} {
  return {
    text: `Garden alert: ${alert.text}`,
    level: alert.severity === "error" ? "assertive" : "polite",
  };
}

export {
  MOISTURE_CRITICAL,
  RESERVOIR_EMPTY,
  LIGHT_NIGHT,
  LIGHT_DAY,
  HEALTH_MILESTONE,
};
