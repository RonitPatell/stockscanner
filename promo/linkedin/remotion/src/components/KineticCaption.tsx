import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FONT_BODY, FONT_IMPACT } from "../lib/fonts";
import { COLORS } from "../lib/theme";

export type CaptionWord = { text: string; accent?: boolean };

/**
 * Giant kinetic caption: words spring in one by one with blur + rise,
 * emerald accent words, optional sub-line underneath.
 */
export const KineticCaption: React.FC<{
  words: CaptionWord[];
  sub?: string;
  size?: number;
  align?: "center" | "bottom";
  outAt?: number;
  stagger?: number;
}> = ({ words, sub, size = 170, align = "center", outAt, stagger = 5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const exit =
    outAt !== undefined
      ? interpolate(frame, [outAt, outAt + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: align === "center" ? "center" : "flex-end",
        paddingBottom: align === "bottom" ? 90 : 0,
        pointerEvents: "none",
        transform: `translateY(${exit * -46}px) scale(${1 + exit * 0.06})`,
        opacity: 1 - exit,
        filter: exit > 0 ? `blur(${exit * 8}px)` : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: size * 0.22,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 1700,
        }}
      >
        {words.map((w, i) => {
          const s = spring({
            frame: frame - i * stagger,
            fps,
            config: { damping: 14, stiffness: 160, mass: 0.9 },
          });
          const blur = interpolate(s, [0, 1], [14, 0]);
          return (
            <span
              key={i}
              style={{
                fontFamily: FONT_IMPACT,
                fontSize: size,
                lineHeight: 0.98,
                letterSpacing: "0.015em",
                color: w.accent ? COLORS.emeraldBright : COLORS.zinc100,
                textShadow: w.accent
                  ? `0 0 42px ${COLORS.emerald}cc, 0 0 120px ${COLORS.emerald}55`
                  : "0 10px 60px rgba(0,0,0,0.85)",
                transform: `translateY(${(1 - s) * size * 0.5}px) scale(${
                  0.72 + s * 0.28
                })`,
                opacity: s,
                filter: `blur(${blur}px)`,
                display: "inline-block",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
      {sub ? (
        <div
          style={{
            marginTop: 34,
            fontFamily: FONT_BODY,
            fontSize: 34,
            fontWeight: 500,
            color: COLORS.zinc400,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            opacity: spring({
              frame: frame - words.length * stagger - 6,
              fps,
              config: { damping: 16, stiffness: 120 },
            }),
            textShadow: "0 4px 30px rgba(0,0,0,0.9)",
          }}
        >
          {sub}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
