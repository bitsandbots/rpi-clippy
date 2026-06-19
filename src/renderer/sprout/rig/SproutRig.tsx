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
  const potRef = useRef<SVGPathElement>(null);
  const stemRef = useRef<SVGPathElement>(null);
  const leafLRef = useRef<SVGEllipseElement>(null);
  const leafRRef = useRef<SVGEllipseElement>(null);
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
      pot: potRef.current,
      stem: stemRef.current,
      leafL: leafLRef.current,
      leafR: leafRRef.current,
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
      {/* Pot */}
      <path
        ref={potRef}
        d="M70,255 L65,285 Q65,295 100,295 Q135,295 135,285 L130,255 Z"
        fill={POT_COLOR}
        stroke="#7a4a1a"
        strokeWidth="2"
      />
      {/* Pot rim */}
      <rect
        x="63"
        y="250"
        width="74"
        height="10"
        rx="4"
        fill={POT_COLOR}
        stroke="#7a4a1a"
        strokeWidth="1.5"
      />
      {/* Soil */}
      <ellipse cx="100" cy="252" rx="32" ry="6" fill={EARTH} />

      {/* Stem */}
      <path
        ref={stemRef}
        d="M100,250 C100,220 96,180 100,90"
        fill="none"
        stroke={GREEN_DARK}
        strokeWidth="6"
        strokeLinecap="round"
        style={{ transformOrigin: "100px 249px" }}
      />

      {/* Left leaf */}
      <ellipse
        ref={leafLRef}
        cx="54"
        cy="156"
        rx="36"
        ry="14"
        fill={GREEN_MID}
        stroke={GREEN_DARK}
        strokeWidth="1.5"
        style={{ transformOrigin: "94px 156px" }}
        transform="rotate(-25, 94, 156)"
      />

      {/* Right leaf */}
      <ellipse
        ref={leafRRef}
        cx="146"
        cy="156"
        rx="36"
        ry="14"
        fill={GREEN_MID}
        stroke={GREEN_DARK}
        strokeWidth="1.5"
        style={{ transformOrigin: "106px 156px" }}
        transform="rotate(25, 106, 156)"
      />

      {/* Face circle */}
      <circle
        ref={faceRef}
        cx="100"
        cy="81"
        r="34"
        fill={FACE_COLOR}
        stroke={GREEN_DARK}
        strokeWidth="2"
      />

      {/* Eyes */}
      <ellipse
        ref={eyeLRef}
        cx="86"
        cy="78"
        rx="6"
        ry="7"
        fill={EYE_COLOR}
        style={{ transformOrigin: "86px 78px" }}
      />
      <ellipse
        ref={eyeRRef}
        cx="114"
        cy="78"
        rx="6"
        ry="7"
        fill={EYE_COLOR}
        style={{ transformOrigin: "114px 78px" }}
      />

      {/* Eye highlights */}
      <circle cx="83" cy="75" r="2" fill="white" />
      <circle cx="111" cy="75" r="2" fill="white" />

      {/* Lids */}
      <path
        ref={lidLRef}
        d="M80,72 Q86,68 92,72"
        fill={GREEN_LIGHT}
        stroke="none"
        style={{ transformOrigin: "86px 72px" }}
      />
      <path
        ref={lidRRef}
        d="M108,72 Q114,68 120,72"
        fill={GREEN_LIGHT}
        stroke="none"
        style={{ transformOrigin: "114px 72px" }}
      />

      {/* Brows */}
      <path
        ref={browLRef}
        d="M78,62 Q86,58 94,62"
        fill="none"
        stroke={GREEN_DARK}
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ transformOrigin: "86px 60px" }}
      />
      <path
        ref={browRRef}
        d="M106,62 Q114,58 122,62"
        fill="none"
        stroke={GREEN_DARK}
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ transformOrigin: "114px 60px" }}
      />

      {/* Mouth (default: gentle smile) */}
      <path
        ref={mouthRef}
        d="M88,96 Q100,104 112,96"
        fill="none"
        stroke={GREEN_DARK}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Bloom (initially hidden) */}
      <g ref={bloomRef} style={{ transformOrigin: "100px 30px", opacity: 0 }}>
        <circle cx="100" cy="30" r="10" fill={BLOOM_COLOR} />
        {[0, 60, 120, 180, 240, 300].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const px = 100 + Math.cos(rad) * 16;
          const py = 30 + Math.sin(rad) * 16;
          return (
            <circle key={angle} cx={px} cy={py} r="5" fill={BLOOM_COLOR} />
          );
        })}
      </g>
    </svg>
  );
});
