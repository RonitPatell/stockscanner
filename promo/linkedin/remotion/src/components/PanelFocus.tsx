import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { FONT_BODY } from "../lib/fonts";
import { COLORS } from "../lib/theme";

export type StatChip = {
  text: string;
  x: number; // % of width
  y: number; // % of height
  tone?: "up" | "down" | "info";
  delay?: number;
};

/**
 * 2.5D dolly onto a region of a real dashboard screenshot:
 * perspective tilt + slow push-in from an overview framing to a focus point,
 * with floating parallax stat chips and a sweeping sheen.
 */
export const PanelFocus: React.FC<{
  src: string;
  focusX: number; // px in 1920 space
  focusY: number; // px in 1080 space
  zoomFrom?: number;
  zoomTo?: number;
  tiltDir?: 1 | -1;
  whipDir?: 1 | -1;
  chips?: StatChip[];
  durationInFrames: number;
}> = ({
  src,
  focusX,
  focusY,
  zoomFrom = 1.06,
  zoomTo = 1.85,
  tiltDir = 1,
  whipDir = 1,
  chips = [],
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Whip-pan entrance
  const enter = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 90, mass: 1.1 },
  });
  const whipX = (1 - enter) * 240 * whipDir;
  const enterBlur = (1 - enter) * 16;

  // Dolly-in toward the focus point
  const t = interpolate(frame, [8, durationInFrames - 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const scale = interpolate(t, [0, 1], [zoomFrom, zoomTo]);
  const tx = interpolate(t, [0, 1], [0, 960 - focusX]);
  const ty = interpolate(t, [0, 1], [0, 540 - focusY]);

  // Gentle 3D drift
  const rotY = tiltDir * (4.5 - t * 2.2) + Math.sin(frame * 0.02) * 0.7;
  const rotX = -1.6 + t * 0.8 + Math.cos(frame * 0.016) * 0.5;

  // Sheen sweep across the glass
  const sheenX = interpolate(frame, [10, 70], [-40, 130], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        perspective: 1500,
        transform: `translateX(${whipX}px)`,
        filter: enterBlur > 0.5 ? `blur(${enterBlur}px)` : undefined,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 1920,
          height: 1080,
          transform: `rotateY(${rotY}deg) rotateX(${rotX}deg) scale(0.86)`,
          transformStyle: "preserve-3d",
        }}
      >
        {/* glow bed behind the screen */}
        <div
          style={{
            position: "absolute",
            inset: -26,
            borderRadius: 34,
            background: `radial-gradient(ellipse at 50% 60%, ${COLORS.emerald}55, transparent 70%)`,
            filter: "blur(34px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 22,
            overflow: "hidden",
            border: `1.5px solid ${COLORS.emerald}66`,
            boxShadow: `0 40px 120px rgba(0,0,0,0.75), 0 0 90px ${COLORS.emerald}33`,
            background: "#09090b",
          }}
        >
          <Img
            src={staticFile(src)}
            style={{
              width: 1920,
              height: 1080,
              transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
              transformOrigin: "50% 50%",
            }}
          />
          {/* sheen */}
          <div
            style={{
              position: "absolute",
              top: "-30%",
              left: `${sheenX}%`,
              width: "22%",
              height: "160%",
              background:
                "linear-gradient(100deg, transparent, rgba(255,255,255,0.09) 50%, transparent)",
              transform: "rotate(10deg)",
              pointerEvents: "none",
            }}
          />
          {/* soft top light */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.05), transparent 22%, transparent 80%, rgba(0,0,0,0.35))",
              pointerEvents: "none",
            }}
          />
        </div>

        {/* floating parallax chips */}
        {chips.map((c, i) => {
          const s = spring({
            frame: frame - 16 - (c.delay ?? i * 7),
            fps,
            config: { damping: 13, stiffness: 150 },
          });
          const float = Math.sin(frame * 0.055 + i * 1.7) * 7;
          const color =
            c.tone === "down"
              ? COLORS.red
              : c.tone === "info"
                ? COLORS.zinc100
                : COLORS.emeraldBright;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${c.x}%`,
                top: `${c.y}%`,
                transform: `translate(-50%, -50%) translateY(${
                  (1 - s) * 40 + float
                }px) translateZ(90px) scale(${0.7 + s * 0.3})`,
                opacity: s,
                fontFamily: FONT_BODY,
                fontWeight: 700,
                fontSize: 27,
                letterSpacing: "0.02em",
                color,
                background: "rgba(2,6,23,0.88)",
                border: `1.5px solid ${color}55`,
                borderRadius: 999,
                padding: "12px 26px",
                boxShadow: `0 18px 50px rgba(0,0,0,0.6), 0 0 34px ${color}33`,
                whiteSpace: "nowrap",
                backdropFilter: "blur(6px)",
              }}
            >
              {c.text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
