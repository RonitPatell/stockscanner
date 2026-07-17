import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { COLORS } from "../lib/theme";

/**
 * Dark-void backdrop: emerald nebula glow, perspective grid floor,
 * drifting particles. Fully deterministic (frame-driven).
 */
export const Backdrop: React.FC<{
  grid?: boolean;
  glow?: number;
  particles?: number;
}> = ({ grid = true, glow = 1, particles = 70 }) => {
  const frame = useCurrentFrame();

  const dots = useMemo(
    () =>
      Array.from({ length: particles }).map((_, i) => ({
        x: random(`px-${i}`) * 100,
        y: random(`py-${i}`) * 100,
        s: 1 + random(`ps-${i}`) * 2.6,
        v: 0.16 + random(`pv-${i}`) * 0.5,
        tw: random(`pt-${i}`) * Math.PI * 2,
      })),
    [particles]
  );

  const gridShift = (frame * 1.2) % 80;

  return (
    <AbsoluteFill style={{ background: COLORS.bgDeep, overflow: "hidden" }}>
      {/* nebula glows */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 55% at 50% 118%, ${COLORS.emerald}33, transparent 62%),
             radial-gradient(ellipse 42% 34% at 18% -8%, #0e766044, transparent 65%),
             radial-gradient(ellipse 36% 30% at 86% 8%, #02422f55, transparent 60%)`,
          opacity: glow,
        }}
      />
      {/* grid floor */}
      {grid && (
        <div
          style={{
            position: "absolute",
            left: "-30%",
            right: "-30%",
            bottom: "-42%",
            height: "78%",
            transform: "perspective(700px) rotateX(66deg)",
            transformOrigin: "50% 0%",
            backgroundImage: `linear-gradient(${COLORS.emerald}2e 1.5px, transparent 1.5px),
               linear-gradient(90deg, ${COLORS.emerald}2e 1.5px, transparent 1.5px)`,
            backgroundSize: "80px 80px",
            backgroundPosition: `0px ${gridShift}px`,
            maskImage:
              "linear-gradient(180deg, transparent 0%, black 30%, black 75%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(180deg, transparent 0%, black 30%, black 75%, transparent 100%)",
          }}
        />
      )}
      {/* particles */}
      {dots.map((d, i) => {
        const y = ((d.y - frame * d.v * 0.12 + 100) % 100 + 100) % 100;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(frame * 0.05 + d.tw));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${d.x}%`,
              top: `${y}%`,
              width: d.s,
              height: d.s,
              borderRadius: "50%",
              background: COLORS.emeraldBright,
              boxShadow: `0 0 ${d.s * 4}px ${COLORS.emerald}`,
              opacity: tw * interpolate(d.s, [1, 3.6], [0.25, 0.7]),
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
