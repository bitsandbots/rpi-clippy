// © CoreConduit Consulting Services — MIT License
//
// Sprout rig — "wavy-stem flex" pass (built on the flower-head art).
// Changes vs. the previous version:
//   1. STEM CHAIN. The stem is now a chain of nested pivot groups so the stalk
//      can BEND in a travelling S-wave (a "dance") instead of leaning rigidly:
//        body (lean about pot 100,250)
//          └─ segLower (pivot 100,218) — lower stem + foliage
//               └─ segUpper (pivot 100,150) — upper stem
//                    └─ headBob (pivot 100,120) — arms, petals, face, features
//      The head is NESTED inside the top group, so it can never detach: each
//      joint rotates about the point it shares with its parent. The brain writes
//      one rotate() per group (see brain.ts writeRig); sway now lives on this
//      chain, while `body` carries only the slow mood stemLean.
//      The stem PATH is split at its on-curve midpoint (100,150): the lower
//      sub-path lives in segLower, the upper in segUpper. Round linecaps hide
//      the seam (it sits on segUpper's pivot, so it never opens).
//   2. FLOWER head. Daisy-style petals radiate from the face center (100,90),
//      drawn BEHIND the face disc, so eyes/mouth/brows are unchanged and the
//      disc reads as the flower's center. Petals are static (no refs) and
//      yellow-orange (marigold); recolor via the #gPetal stops + PETAL_EDGE.
//
// Every brain-referenced anchor is unchanged (eyes 88,88/112,88 · mouth
// 88,104/112,104 · shoulders 92,126/108,126 · blades 66,108/134,108 · bloom
// 100,54): nesting only ADDS parent transforms, child-local coords are intact.
//
// Depth is gradients only — NO blur/drop-shadow filters on the moving body —
// so per-frame re-rasterization stays cheap on Pi / edge nodes.
//
// NOTE: gradient ids are global; suffix them per instance if you mount several.

import { useRef, useImperativeHandle, forwardRef } from "react";
import type { PartId } from "./parts";

const VB_W = 200;
const VB_H = 300;

const OUTLINE = "#1f5a22";
const VEIN = "#256b2e";
const EYE_RIM = "#0a1607";
const LID = "#86d99a";
const EARTH = "#7a4a26";
const EARTH_DK = "#5e3819";
const STEM_HI = "#7fd6a0";
const ARM_HI = "#4cba6f";
const PETAL_EDGE = "#b5611a"; // warm outline for the yellow-orange petals

// Flower petals: angles around the face center (SVG: 0=right, 90=down). The
// bottom wedge (60/90/120) is intentionally omitted so the stem meets the head.
const PETAL_ANGLES = [150, 180, 210, 240, 270, 300, 330, 0, 30];
const PETAL_DIST = 33;

export type RigRefs = Record<PartId, SVGElement | null> & {
  /** Root <svg> element — brain writes CSS filter: saturate() here. */
  root: SVGSVGElement | null;
};

export interface SproutRigHandle {
  refs: RigRefs;
}

// Optional ambient idle — decorative only, touches NO rig part. Opacity-only,
// gated behind prefers-reduced-motion. Delete this + the <style> tag + the
// `sprout-sheen` className to remove it; uncomment the marked block for sparkles.
const AMBIENT_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .sprout-sheen { animation: sproutSheen 4.2s ease-in-out infinite; }
  /* .sprout-spark { animation: sproutTwinkle 3.6s ease-in-out infinite; }
     .sprout-spark.b { animation-delay: 1.8s; } */
}
@keyframes sproutSheen { 0%, 100% { opacity: 0.30; } 50% { opacity: 0.15; } }
@keyframes sproutTwinkle { 0%, 100% { opacity: 0; transform: scale(0.55); } 50% { opacity: 0.9; transform: scale(1); } }
.sprout-spark { transform-box: fill-box; transform-origin: center; }
`;

export const SproutRig = forwardRef<
  SproutRigHandle,
  { style?: React.CSSProperties }
>(function SproutRig({ style }, handle) {
  const rootRef = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const potRef = useRef<SVGPathElement>(null);
  const stemRef = useRef<SVGPathElement>(null);
  // Stem flex chain — nested pivot groups (lower → upper → head). The brain
  // rotates each per frame to produce the travelling wave; the head rides the
  // top group so it stays attached at the neck.
  const segLowerRef = useRef<SVGGElement>(null);
  const segUpperRef = useRef<SVGGElement>(null);
  const headBobRef = useRef<SVGGElement>(null);
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
      segLower: segLowerRef.current,
      segUpper: segUpperRef.current,
      headBob: headBobRef.current,
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
      <defs>
        <radialGradient id="gHead" cx="38%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#79e8a4" />
          <stop offset="55%" stopColor="#4ec97a" />
          <stop offset="100%" stopColor="#2c9755" />
        </radialGradient>
        <linearGradient id="gLeaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#62d488" />
          <stop offset="100%" stopColor="#2b8c4d" />
        </linearGradient>
        {/* Flower petals — yellow-orange (marigold). Recolor here to taste. */}
        <linearGradient id="gPetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffdf6b" />
          <stop offset="50%" stopColor="#fbb034" />
          <stop offset="100%" stopColor="#ef7e16" />
        </linearGradient>
        <linearGradient
          id="gStem"
          x1="88"
          y1="0"
          x2="112"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#4cba6f" />
          <stop offset="55%" stopColor="#2f8c4f" />
          <stop offset="100%" stopColor="#236c3d" />
        </linearGradient>
        <linearGradient
          id="gPot"
          x1="0"
          y1="214"
          x2="0"
          y2="266"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#e2974c" />
          <stop offset="100%" stopColor="#b1611d" />
        </linearGradient>
        <radialGradient id="gBloom" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#ffe289" />
          <stop offset="100%" stopColor="#f4b733" />
        </radialGradient>
        <radialGradient id="gEye" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#3a4d33" />
          <stop offset="60%" stopColor="#16280f" />
          <stop offset="100%" stopColor="#0c1a08" />
        </radialGradient>
      </defs>

      <style dangerouslySetInnerHTML={{ __html: AMBIENT_CSS }} />

      {/* Grounding shadow — static + filter-free (costs nothing per frame). */}
      <ellipse cx="101" cy="268" rx="52" ry="7" fill="#000000" opacity="0.16" />

      {/* Pot — raised ~30 to shorten the stem. Planted; stays fixed while the
          body above sways. */}
      <path
        ref={potRef}
        d="M68,220 L62,256 Q62,266 100,266 Q138,266 138,256 L132,220 Z"
        fill="url(#gPot)"
        stroke={OUTLINE}
        strokeWidth="2.4"
      />
      <path
        d="M70,222 Q100,228 130,222 L129,228 Q100,233 71,228 Z"
        fill="#ffffff"
        opacity="0.18"
      />
      <rect
        x="58"
        y="214"
        width="84"
        height="11"
        rx="4"
        fill="url(#gPot)"
        stroke={OUTLINE}
        strokeWidth="2"
      />
      <rect
        x="60"
        y="215.5"
        width="80"
        height="3"
        rx="1.5"
        fill="#ffffff"
        opacity="0.22"
      />
      <ellipse cx="100" cy="217" rx="36" ry="6" fill={EARTH} />
      <ellipse cx="100" cy="218" rx="30" ry="4" fill={EARTH_DK} opacity="0.7" />

      {/* Everything above the soil. `body` carries the slow mood stemLean
          (pivot 100,250 to match brain.ts); the per-frame sway wave lives on
          the nested segLower → segUpper → headBob chain below. */}
      <g ref={bodyRef} style={{ transformOrigin: "100px 250px" }}>
        {/* Lower stem segment — pivots near the soil (100,218). Carries the
            lower stem layers + foliage, and nests the rest of the plant. */}
        <g ref={segLowerRef} style={{ transformOrigin: "100px 218px" }}>
          {/* Lower foliage — small leaflets, drawn behind the stem. */}
          <g
            fill="url(#gLeaf)"
            stroke={OUTLINE}
            strokeWidth="1.3"
            strokeLinejoin="round"
          >
            <path d="M100,188 Q92,186 82,190 Q92,194 100,190 Z" />
            <path d="M100,162 Q108,160 118,164 Q108,168 100,164 Z" />
          </g>

          {/* Lower stem — outline underlay + gradient core + left highlight.
              Path split at the on-curve midpoint (100,150). Ref on the core. */}
          <path
            d="M100,220 C97,198 103,172 100,150"
            fill="none"
            stroke={OUTLINE}
            strokeWidth="11"
            strokeLinecap="round"
          />
          <path
            ref={stemRef}
            d="M100,220 C97,198 103,172 100,150"
            fill="none"
            stroke="url(#gStem)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M98.5,218 C95,198 102.5,172 98.5,150"
            fill="none"
            stroke={STEM_HI}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.55"
          />

          {/* Upper stem segment — pivots at the mid joint (100,150). */}
          <g ref={segUpperRef} style={{ transformOrigin: "100px 150px" }}>
            <path
              d="M100,150 C98,135 100,128 100,118"
              fill="none"
              stroke={OUTLINE}
              strokeWidth="11"
              strokeLinecap="round"
            />
            <path
              d="M100,150 C98,135 100,128 100,118"
              fill="none"
              stroke="url(#gStem)"
              strokeWidth="8"
              strokeLinecap="round"
            />

            {/* Head cluster — pivots at the neck (100,120). Counter-bobs so the
                face stays readable while the stalk whips. Nested here so the
                head can never detach from the stem top. */}
            <g ref={headBobRef} style={{ transformOrigin: "100px 120px" }}>
              {/* Bloom (initially hidden) — above the head, behind the face. */}
              <g
                ref={bloomRef}
                style={{ transformOrigin: "100px 54px", opacity: 0 }}
              >
                <circle cx="100" cy="54" r="9" fill="url(#gBloom)" />
                {[0, 60, 120, 180, 240, 300].map((angle) => {
                  const rad = (angle * Math.PI) / 180;
                  const px = 100 + Math.cos(rad) * 15;
                  const py = 54 + Math.sin(rad) * 15;
                  return (
                    <circle
                      key={angle}
                      cx={px}
                      cy={py}
                      r="5"
                      fill="url(#gBloom)"
                      stroke={OUTLINE}
                      strokeWidth="0.8"
                    />
                  );
                })}
              </g>

              {/* Left arm: branch → pointed veined leaf. Pivots at the shoulder
                  (92,126); brain rotates it for droop/sway/gesture. */}
              <g ref={leafLRef} style={{ transformOrigin: "92px 126px" }}>
                <path
                  d="M92,126 Q80,118 66,108"
                  fill="none"
                  stroke={OUTLINE}
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d="M92,126 Q80,118 66,108"
                  fill="none"
                  stroke={ARM_HI}
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.5"
                />
                <g ref={leafBladeLRef} style={{ transformOrigin: "66px 108px" }}>
                  <path
                    d="M66,108 Q54,92 38,94 Q46,108 66,110 Z"
                    fill="url(#gLeaf)"
                    stroke={OUTLINE}
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M64,108 L42,96"
                    fill="none"
                    stroke={VEIN}
                    strokeWidth="1.1"
                    strokeLinecap="round"
                  />
                  <path
                    d="M56,102 L50,97"
                    fill="none"
                    stroke={VEIN}
                    strokeWidth="0.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M58,105 L50,103"
                    fill="none"
                    stroke={VEIN}
                    strokeWidth="0.8"
                    strokeLinecap="round"
                  />
                </g>
              </g>

              {/* Right arm: mirror of the left, pivot at (108,126). */}
              <g ref={leafRRef} style={{ transformOrigin: "108px 126px" }}>
                <path
                  d="M108,126 Q120,118 134,108"
                  fill="none"
                  stroke={OUTLINE}
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d="M108,126 Q120,118 134,108"
                  fill="none"
                  stroke={ARM_HI}
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.5"
                />
                <g ref={leafBladeRRef} style={{ transformOrigin: "134px 108px" }}>
                  <path
                    d="M134,108 Q146,92 162,94 Q154,108 134,110 Z"
                    fill="url(#gLeaf)"
                    stroke={OUTLINE}
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M136,108 L158,96"
                    fill="none"
                    stroke={VEIN}
                    strokeWidth="1.1"
                    strokeLinecap="round"
                  />
                  <path
                    d="M144,102 L150,97"
                    fill="none"
                    stroke={VEIN}
                    strokeWidth="0.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M142,105 L150,103"
                    fill="none"
                    stroke={VEIN}
                    strokeWidth="0.8"
                    strokeLinecap="round"
                  />
                </g>
              </g>

              {/* Crown collar (calyx) — sepals cupping the flower base. Static. */}
              <g
                fill="url(#gLeaf)"
                stroke={OUTLINE}
                strokeWidth="1.5"
                strokeLinejoin="round"
              >
                <path d="M96,116 Q74,116 62,102 Q80,118 99,120 Z" />
                <path d="M104,116 Q126,116 138,102 Q120,118 101,120 Z" />
                <path d="M98,119 Q86,126 80,138 Q92,128 100,122 Z" />
                <path d="M102,119 Q114,126 120,138 Q108,128 100,122 Z" />
              </g>

              {/* Flower petals — radiate from the face center, behind the disc. */}
              <g>
                {PETAL_ANGLES.map((a) => {
                  const rad = (a * Math.PI) / 180;
                  const cx = 100 + PETAL_DIST * Math.cos(rad);
                  const cy = 90 + PETAL_DIST * Math.sin(rad);
                  return (
                    <ellipse
                      key={a}
                      cx={cx}
                      cy={cy}
                      rx="15"
                      ry="9"
                      fill="url(#gPetal)"
                      stroke={PETAL_EDGE}
                      strokeWidth="1.4"
                      transform={`rotate(${a} ${cx.toFixed(2)} ${cy.toFixed(2)})`}
                    />
                  );
                })}
              </g>

              {/* Face — flower center / volumetric gradient sphere. */}
              <circle
                ref={faceRef}
                cx="100"
                cy="90"
                r="30"
                fill="url(#gHead)"
                stroke={OUTLINE}
                strokeWidth="2.4"
              />
              {/* Specular sheen (decorative). `sprout-sheen` = optional shimmer. */}
              <ellipse
                className="sprout-sheen"
                cx="88"
                cy="76"
                rx="13"
                ry="8"
                fill="#ffffff"
                opacity="0.30"
                transform="rotate(-24 88 76)"
              />

              {/* Optional twinkle sparkles — uncomment + the CSS block above.
              <circle className="sprout-spark" cx="78" cy="66" r="1.7" fill="#ffffff" />
              <circle className="sprout-spark b" cx="120" cy="72" r="1.4" fill="#ffffff" />
              */}

              {/* Eyes — glossy, primary + secondary catchlight. */}
              <ellipse
                ref={eyeLRef}
                cx="88"
                cy="88"
                rx="6.2"
                ry="7.2"
                fill="url(#gEye)"
                stroke={EYE_RIM}
                strokeWidth="0.6"
                style={{ transformOrigin: "88px 88px" }}
              />
              <ellipse
                ref={eyeRRef}
                cx="112"
                cy="88"
                rx="6.2"
                ry="7.2"
                fill="url(#gEye)"
                stroke={EYE_RIM}
                strokeWidth="0.6"
                style={{ transformOrigin: "112px 88px" }}
              />
              <circle cx="85.4" cy="84.6" r="2.3" fill="#ffffff" />
              <circle cx="109.4" cy="84.6" r="2.3" fill="#ffffff" />
              <circle cx="90" cy="90.5" r="1" fill="#ffffff" opacity="0.75" />
              <circle cx="114" cy="90.5" r="1" fill="#ffffff" opacity="0.75" />

              {/* Lids */}
              <path
                ref={lidLRef}
                d="M81.5,82 Q88,77.5 94.5,82"
                fill={LID}
                stroke="none"
                style={{ transformOrigin: "88px 82px" }}
              />
              <path
                ref={lidRRef}
                d="M105.5,82 Q112,77.5 118.5,82"
                fill={LID}
                stroke="none"
                style={{ transformOrigin: "112px 82px" }}
              />

              {/* Brows */}
              <path
                ref={browLRef}
                d="M80,72 Q88,67.5 96,72"
                fill="none"
                stroke={OUTLINE}
                strokeWidth="2.6"
                strokeLinecap="round"
                style={{ transformOrigin: "88px 70px" }}
              />
              <path
                ref={browRRef}
                d="M104,72 Q112,67.5 120,72"
                fill="none"
                stroke={OUTLINE}
                strokeWidth="2.6"
                strokeLinecap="round"
                style={{ transformOrigin: "112px 70px" }}
              />

              {/* Mouth — endpoints MUST stay (88,104)/(112,104): brain rewrites
                  this every frame as "M88,104 Q100,<cpY> 112,104". */}
              <path
                ref={mouthRef}
                d="M88,104 Q100,112 112,104"
                fill="none"
                stroke={OUTLINE}
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
});
