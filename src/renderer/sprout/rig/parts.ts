// © CoreConduit Consulting Services — MIT License
//
// SVG rig anchor table. ViewBox: 0 0 200 300.
// All positions are % of viewBox width × height.
// The brain writes these attributes per-frame via refs (no React re-renders).

export type PartId =
  | "pot"
  | "stem"
  | "leafL"
  | "leafR"
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
  pot: {
    id: "pot",
    center: [50, 90],
    rotationOrigin: [50, 90],
    writableAttrs: ["fill", "opacity"],
  },
  stem: {
    id: "stem",
    center: [50, 57],
    rotationOrigin: [50, 83],
    writableAttrs: ["transform", "stroke"],
  },
  leafL: {
    id: "leafL",
    center: [27, 52],
    rotationOrigin: [47, 52],
    writableAttrs: ["transform", "fill", "opacity"],
  },
  leafR: {
    id: "leafR",
    center: [73, 52],
    rotationOrigin: [53, 52],
    writableAttrs: ["transform", "fill", "opacity"],
  },
  face: {
    id: "face",
    center: [50, 27],
    rotationOrigin: [50, 27],
    writableAttrs: ["fill"],
  },
  eyeL: {
    id: "eyeL",
    center: [43, 27],
    rotationOrigin: [43, 27],
    writableAttrs: ["transform", "fill"],
  },
  eyeR: {
    id: "eyeR",
    center: [57, 27],
    rotationOrigin: [57, 27],
    writableAttrs: ["transform", "fill"],
  },
  lidL: {
    id: "lidL",
    center: [43, 25],
    rotationOrigin: [43, 24],
    writableAttrs: ["transform"],
  },
  lidR: {
    id: "lidR",
    center: [57, 25],
    rotationOrigin: [57, 24],
    writableAttrs: ["transform"],
  },
  browL: {
    id: "browL",
    center: [43, 20],
    rotationOrigin: [43, 20],
    writableAttrs: ["transform", "stroke-width"],
  },
  browR: {
    id: "browR",
    center: [57, 20],
    rotationOrigin: [57, 20],
    writableAttrs: ["transform", "stroke-width"],
  },
  mouth: {
    id: "mouth",
    center: [50, 33],
    rotationOrigin: [50, 33],
    writableAttrs: ["d", "stroke"],
  },
  bloom: {
    id: "bloom",
    center: [50, 10],
    rotationOrigin: [50, 10],
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
