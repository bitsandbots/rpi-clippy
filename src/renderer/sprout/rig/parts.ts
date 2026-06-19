// © CoreConduit Consulting Services — MIT License
//
// SVG rig anchor table. ViewBox: 0 0 200 300.
// All positions are % of viewBox width × height.
// The brain writes these attributes per-frame via refs (no React re-renders).

export type PartId =
  | "body"
  | "pot"
  | "stem"
  | "segLower"
  | "segUpper"
  | "headBob"
  | "leafL"
  | "leafR"
  | "leafBladeL"
  | "leafBladeR"
  | "face"
  | "eyeL"
  | "eyeR"
  | "lidL"
  | "lidR"
  | "browL"
  | "browR"
  | "mouth"
  | "bloom";

export type PartDef = {
  id: PartId;
  /** Center position as [x%, y%] of viewBox 200×300. */
  center: [number, number];
  /** Rotation origin as [x%, y%] of viewBox. */
  rotationOrigin: [number, number];
  /** SVG attributes the brain is allowed to write. */
  writableAttrs: string[];
};

export const PARTS: Record<PartId, PartDef> = {
  // Whole plant above the soil. Rotated about the pot base for stemLean + sway;
  // carries the head/stem/arms together so the head never detaches.
  body: {
    id: "body",
    center: [50, 60],
    rotationOrigin: [50, 83],
    writableAttrs: ["transform"],
  },
  pot: {
    id: "pot",
    center: [50, 90],
    rotationOrigin: [50, 90],
    writableAttrs: ["fill", "opacity"],
  },
  stem: {
    id: "stem",
    center: [50, 61],
    rotationOrigin: [50, 83],
    writableAttrs: ["stroke"],
  },
  // Stem flex chain — nested pivot groups rotated per-frame to bend the stalk
  // in a travelling S-wave. Each pivots on the joint it shares with its parent
  // (segLower @ soil, segUpper @ mid, headBob @ neck) so the head never detaches.
  segLower: {
    id: "segLower",
    center: [50, 62],
    rotationOrigin: [50, 73], // SVG (100,218) — near the soil line
    writableAttrs: ["transform"],
  },
  segUpper: {
    id: "segUpper",
    center: [50, 47],
    rotationOrigin: [50, 50], // SVG (100,150) — mid-stem joint
    writableAttrs: ["transform"],
  },
  headBob: {
    id: "headBob",
    center: [50, 30],
    rotationOrigin: [50, 40], // SVG (100,120) — neck joint below the head
    writableAttrs: ["transform"],
  },
  leafL: {
    id: "leafL",
    center: [26, 34],
    rotationOrigin: [46, 42],
    writableAttrs: ["transform", "fill", "opacity"],
  },
  leafR: {
    id: "leafR",
    center: [74, 34],
    rotationOrigin: [54, 42],
    writableAttrs: ["transform", "fill", "opacity"],
  },
  // Leaf blades — inner groups rotated about the branch/blade joint (the
  // "wrist") for tip curl and the greeting waggle. Nested inside leafL/leafR.
  leafBladeL: {
    id: "leafBladeL",
    center: [21, 32],
    rotationOrigin: [33, 36],
    writableAttrs: ["transform"],
  },
  leafBladeR: {
    id: "leafBladeR",
    center: [79, 32],
    rotationOrigin: [67, 36],
    writableAttrs: ["transform"],
  },
  face: {
    id: "face",
    center: [50, 30],
    rotationOrigin: [50, 30],
    writableAttrs: ["fill"],
  },
  eyeL: {
    id: "eyeL",
    center: [44, 29],
    rotationOrigin: [44, 29],
    writableAttrs: ["transform", "fill"],
  },
  eyeR: {
    id: "eyeR",
    center: [56, 29],
    rotationOrigin: [56, 29],
    writableAttrs: ["transform", "fill"],
  },
  lidL: {
    id: "lidL",
    center: [44, 27],
    rotationOrigin: [44, 27],
    writableAttrs: ["transform"],
  },
  lidR: {
    id: "lidR",
    center: [56, 27],
    rotationOrigin: [56, 27],
    writableAttrs: ["transform"],
  },
  browL: {
    id: "browL",
    center: [44, 24],
    rotationOrigin: [44, 23],
    writableAttrs: ["transform", "stroke-width"],
  },
  browR: {
    id: "browR",
    center: [56, 24],
    rotationOrigin: [56, 23],
    writableAttrs: ["transform", "stroke-width"],
  },
  mouth: {
    id: "mouth",
    center: [50, 35],
    rotationOrigin: [50, 35],
    writableAttrs: ["d", "stroke"],
  },
  bloom: {
    id: "bloom",
    center: [50, 18],
    rotationOrigin: [50, 18],
    writableAttrs: ["opacity", "transform", "fill"],
  },
};

/** Convert a % anchor to absolute SVG units given the viewBox dimensions. */
export function pctToSvg(
  pct: [number, number],
  vbW = 200,
  vbH = 300,
): [number, number] {
  return [(pct[0] / 100) * vbW, (pct[1] / 100) * vbH];
}
