// © CoreConduit Consulting Services — MIT License

import type { OneShotDef } from "../engine/oneShot";

export const REACTIONS: Record<string, OneShotDef> = {
  blink: {
    key: "blink",
    durationMs: 150,
    filteredTracks: ["eyeOpenness"],
    target: { eyeOpenness: 0.0 },
    interruptSelf: true,
  },
  greet: {
    key: "greet",
    durationMs: 1200,
    filteredTracks: ["mouthCurve", "browOffsetY", "eyeOpenness"],
    target: { mouthCurve: 1.0, browOffsetY: -3, eyeOpenness: 1.0 },
  },
  nod: {
    key: "nod",
    durationMs: 600,
    filteredTracks: ["stemLean"],
    target: { stemLean: 6 },
  },
  celebrate: {
    key: "celebrate",
    durationMs: 2000,
    filteredTracks: [
      "mouthCurve",
      "browOffsetY",
      "eyeOpenness",
      "swayAmplitude",
      "leafDroop",
    ],
    target: {
      mouthCurve: 1.0,
      browOffsetY: -4,
      eyeOpenness: 1.0,
      swayAmplitude: 6,
      leafDroop: 0,
    },
  },
  surprised: {
    key: "surprised",
    durationMs: 800,
    filteredTracks: ["eyeOpenness", "browOffsetY"],
    target: { eyeOpenness: 1.0, browOffsetY: -4 },
  },
  concern: {
    key: "concern",
    durationMs: 1000,
    filteredTracks: ["browOffsetY", "mouthCurve"],
    target: { browOffsetY: 4, mouthCurve: -0.7 },
    interruptSelf: false,
  },
  sip: {
    key: "sip",
    durationMs: 1500,
    filteredTracks: ["stemLean", "leafDroop", "mouthCurve"],
    target: { stemLean: -3, leafDroop: 0, mouthCurve: 0.5 },
  },
  yawn: {
    key: "yawn",
    durationMs: 2000,
    filteredTracks: ["mouthCurve", "eyeOpenness"],
    target: { mouthCurve: -0.8, eyeOpenness: 0.1 },
    interruptSelf: false,
  },
  talk: {
    key: "talk",
    durationMs: 0, // set dynamically from TTS_START.durationMs
    filteredTracks: ["mouthCurve"],
    target: { mouthCurve: 0.6 },
  },
  perk: {
    key: "perk",
    durationMs: 400,
    filteredTracks: ["stemLean", "browOffsetY", "eyeOpenness"],
    target: { stemLean: -1, browOffsetY: -2, eyeOpenness: 1.0 },
  },
  wave: {
    key: "wave",
    durationMs: 1600,
    // Perks the leaf tips up; brain.ts adds a fast waggle oscillation on top
    // while this overlay is active. swayAmplitude bump gives a friendly bob.
    filteredTracks: ["leafTipCurl", "swayAmplitude"],
    target: { leafTipCurl: -12, swayAmplitude: 5 },
  },
  "grow-leaf": {
    key: "grow-leaf",
    durationMs: 3000,
    filteredTracks: ["leafDroop", "mouthCurve"],
    target: { leafDroop: 0, mouthCurve: 0.8 },
    interruptSelf: false,
  },
};

// Bracket-token back-compat mapping: [Key] → reaction key
export const BRACKET_TOKEN_REACTIONS: Record<string, string> = {
  Greeting: "greet",
  GoodBye: "greet",
  Congratulate: "celebrate",
  LookAround: "surprised",
  Alert: "concern",
  Explain: "perk",
  GetAttention: "perk",
};
