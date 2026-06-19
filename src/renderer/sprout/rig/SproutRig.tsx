// © CoreConduit Consulting Services — MIT License

import { useRef, useImperativeHandle, forwardRef } from "react";
import type { PartId } from "./parts";

// ViewBox constants
const VB_W = 200;
const VB_H = 300;

// Base colors
const GREEN_DARK = "#2a6e2a";
const GREEN_MID = "#3dbb68";
const GREEN_LIGHT = "#72d49e";
const EARTH = "#8b5e3c";
const POT_COLOR = "#c0762a";
const FACE_COLOR = "#4cc97a";
const EYE_COLOR = "#1a3a1a";
const BLOOM_COLOR = "#f9c74f";

export type RigRefs = Record<PartId, SVGElement | null> & {
  /** Root <svg> element — brain writes CSS filter: saturate() here. */
  root: SVGSVGElement | null;
};

export interface SproutRigHandle {
  refs: RigRefs;
}

export const SproutRig = forwardRef<
  SproutRigHandle,
  { style?: React.CSSProperties }
>(function SproutRig({ style }, handle) {
  const rootRef = useRef<SVGSVGElement>(null);
  // `body` wraps everything above the soil (stem, arms, collar, head, bloom).
  // The brain rotates this single group about the pot base for stemLean + sway,
  // so the head, stem, and arms always move as one connected unit and the head
  // can never detach from the stem.
  const bodyRef = useRef<SVGGElement>(null);
  const potRef = useRef<SVGPathElement>(null);
  const stemRef = useRef<SVGPathElement>(null);
  const leafLRef = useRef<SVGGElement>(null);
  const leafRRef = useRef<SVGGElement>(null);
  const leafBladeLRef = useRef<SVGGElement>(null);
  const leafBladeRRef = useRef<SVGGElement>(null);
  const faceRef = useRef<SVGCircleElement>(null);
  const eyeLRef = useRef<SVGEllipseElement>(null);
  const eyeRRef = useRef<SVGEllipseElement>(null);
  const lidLRef = useRef<SVGPathElement>(null);
  const lidRRef = useRef<SVGPathElement>(null);
  const browLRef = useRef<SVGPathElement>(null);
  const browRRef = useRef<SVGPathElement>(null);
  const mouthRef = useRef<SVGPathElement>(null);
  const bloomRef = useRef<SVGGElement>(null);

  useImperativeHandle(handle, () => ({
    refs: {
      root: rootRef.current,
      body: bodyRef.current,
      pot: potRef.current,
      stem: stemRef.current,
      leafL: leafLRef.current,
      leafR: leafRRef.current,
      leafBladeL: leafBladeLRef.current,
      leafBladeR: leafBladeRRef.current,
      face: faceRef.current,
      eyeL: eyeLRef.current,
      eyeR: eyeRRef.current,
      lidL: lidLRef.current,
      lidR: lidRRef.current,
      browL: browLRef.current,
      browR: browRRef.current,
      mouth: mouthRef.current,
      bloom: bloomRef.current,
    },
  }));

  return (
    <svg
      ref={rootRef}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      style={{ width: "100%", height: "100%", overflow: "visible", ...style }}
      aria-hidden="true"
    >
      {/* Pot — planted, stays fixed while the body above sways. */}
      <path
        ref={potRef}
        d="M68,250 L62,286 Q62,296 100,296 Q138,296 138,286 L132,250 Z"
        fill={POT_COLOR}
        stroke="#7a4a1a"
        strokeWidth="2"
      />
      {/* Pot rim */}
      <rect
        x="58"
        y="244"
        width="84"
        height="11"
        rx="4"
        fill={POT_COLOR}
        stroke="#7a4a1a"
        strokeWidth="1.5"
      />
      {/* Soil */}
      <ellipse cx="100" cy="247" rx="36" ry="6" fill={EARTH} />

      {/* Everything above the soil rotates as one rigid body about the pot
          base (100,250). The brain writes this group's transform. */}
      <g ref={bodyRef} style={{ transformOrigin: "100px 250px" }}>
        {/* Bloom (initially hidden) — above the head. */}
        <g ref={bloomRef} style={{ transformOrigin: "100px 54px", opacity: 0 }}>
          <circle cx="100" cy="54" r="9" fill={BLOOM_COLOR} />
          {[0, 60, 120, 180, 240, 300].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const px = 100 + Math.cos(rad) * 15;
            const py = 54 + Math.sin(rad) * 15;
            return (
              <circle key={angle} cx={px} cy={py} r="5" fill={BLOOM_COLOR} />
            );
          })}
        </g>

        {/* Lower foliage — small leaflets rooted on the stem (move with body). */}
        <g fill={GREEN_DARK}>
          <path d="M100,196 Q92,194 82,198 Q92,202 100,198 Z" />
          <path d="M100,170 Q108,168 118,172 Q108,176 100,172 Z" />
        </g>

        {/* Trunk — short, sturdy S-curve. Reaches up into the head so the
            stem/head joint is hidden behind the face. */}
        <path
          ref={stemRef}
          d="M100,250 C96,214 104,180 100,152 C97,134 100,128 100,118"
          fill="none"
          stroke={GREEN_DARK}
          strokeWidth="9"
          strokeLinecap="round"
        />

        {/* Left arm: raised branch → pointed leaf with veins. Group pivots at
            the shoulder (92,126); the brain rotates it for droop/sway/gesture.
            The rest angle is baked into the geometry (no base offset). */}
        <g ref={leafLRef} style={{ transformOrigin: "92px 126px" }}>
          <path
            d="M92,126 Q80,118 66,108"
            fill="none"
            stroke={GREEN_DARK}
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          {/* Blade pivots at the wrist joint (66,108) for tip curl + wave. */}
          <g ref={leafBladeLRef} style={{ transformOrigin: "66px 108px" }}>
            <path
              d="M66,108 Q54,92 38,94 Q46,108 66,110 Z"
              fill={GREEN_MID}
              stroke={GREEN_DARK}
              strokeWidth="1.5"
            />
            <path
              d="M64,108 L42,96"
              fill="none"
              stroke={GREEN_DARK}
              strokeWidth="1"
              strokeLinecap="round"
            />
            <path
              d="M56,102 L52,96"
              fill="none"
              stroke={GREEN_DARK}
              strokeWidth="0.8"
              strokeLinecap="round"
            />
            <path
              d="M57,104 L50,104"
              fill="none"
              stroke={GREEN_DARK}
              strokeWidth="0.8"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* Right arm: mirror of the left about x=100, pivot at the shoulder
            (108,126). */}
        <g ref={leafRRef} style={{ transformOrigin: "108px 126px" }}>
          <path
            d="M108,126 Q120,118 134,108"
            fill="none"
            stroke={GREEN_DARK}
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          {/* Blade pivots at the wrist joint (134,108) for tip curl + wave. */}
          <g ref={leafBladeRRef} style={{ transformOrigin: "134px 108px" }}>
            <path
              d="M134,108 Q146,92 162,94 Q154,108 134,110 Z"
              fill={GREEN_MID}
              stroke={GREEN_DARK}
              strokeWidth="1.5"
            />
            <path
              d="M136,108 L158,96"
              fill="none"
              stroke={GREEN_DARK}
              strokeWidth="1"
              strokeLinecap="round"
            />
            <path
              d="M144,102 L148,96"
              fill="none"
              stroke={GREEN_DARK}
              strokeWidth="0.8"
              strokeLinecap="round"
            />
            <path
              d="M143,104 L150,104"
              fill="none"
              stroke={GREEN_DARK}
              strokeWidth="0.8"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* Crown collar (calyx) — sepal leaves cupping the head base, drawn
            before the face so the head nestles into them. Static; no refs. */}
        <g
          fill={GREEN_MID}
          stroke={GREEN_DARK}
          strokeWidth="1.4"
          strokeLinejoin="round"
        >
          <path d="M96,116 Q74,116 62,102 Q80,118 99,120 Z" />
          <path d="M104,116 Q126,116 138,102 Q120,118 101,120 Z" />
          <path d="M98,119 Q86,126 80,138 Q92,128 100,122 Z" />
          <path d="M102,119 Q114,126 120,138 Q108,128 100,122 Z" />
        </g>

        {/* Face circle */}
        <circle
          ref={faceRef}
          cx="100"
          cy="90"
          r="30"
          fill={FACE_COLOR}
          stroke={GREEN_DARK}
          strokeWidth="2"
        />

        {/* Eyes */}
        <ellipse
          ref={eyeLRef}
          cx="88"
          cy="88"
          rx="6"
          ry="7"
          fill={EYE_COLOR}
          style={{ transformOrigin: "88px 88px" }}
        />
        <ellipse
          ref={eyeRRef}
          cx="112"
          cy="88"
          rx="6"
          ry="7"
          fill={EYE_COLOR}
          style={{ transformOrigin: "112px 88px" }}
        />

        {/* Eye highlights */}
        <circle cx="85" cy="85" r="2" fill="white" />
        <circle cx="109" cy="85" r="2" fill="white" />

        {/* Lids */}
        <path
          ref={lidLRef}
          d="M82,82 Q88,78 94,82"
          fill={GREEN_LIGHT}
          stroke="none"
          style={{ transformOrigin: "88px 82px" }}
        />
        <path
          ref={lidRRef}
          d="M106,82 Q112,78 118,82"
          fill={GREEN_LIGHT}
          stroke="none"
          style={{ transformOrigin: "112px 82px" }}
        />

        {/* Brows */}
        <path
          ref={browLRef}
          d="M80,72 Q88,68 96,72"
          fill="none"
          stroke={GREEN_DARK}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ transformOrigin: "88px 70px" }}
        />
        <path
          ref={browRRef}
          d="M104,72 Q112,68 120,72"
          fill="none"
          stroke={GREEN_DARK}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ transformOrigin: "112px 70px" }}
        />

        {/* Mouth (default: gentle smile) */}
        <path
          ref={mouthRef}
          d="M88,104 Q100,112 112,104"
          fill="none"
          stroke={GREEN_DARK}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
});
