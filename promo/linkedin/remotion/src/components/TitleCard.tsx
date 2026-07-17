import React from "react";
import {
  AbsoluteFill,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FONT_BODY, FONT_DISPLAY } from "../lib/fonts";
import { COLORS } from "../lib/theme";
import { Logo } from "./Logo";

/** Logo slam: scale smash + shockwave ring + glitch slices + light streaks */
export const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slam: starts huge, smashes down with a heavy spring
  const slam = spring({
    frame,
    fps,
    config: { damping: 11, stiffness: 210, mass: 1.1 },
  });
  const scale = interpolate(slam, [0, 1], [3.4, 1]);
  const impactFrame = 8;
  const postImpact = Math.max(0, frame - impactFrame);

  // Shockwave rings after impact
  const ring = (delay: number, max: number) => {
    const t = interpolate(postImpact - delay, [0, 26], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return { size: 140 + t * max, opacity: (1 - t) * 0.55 };
  };
  const r1 = ring(0, 1250);
  const r2 = ring(6, 900);

  // Glitch slices right after impact
  const glitch = frame >= impactFrame && frame <= impactFrame + 7;
  const glitchAmp = glitch
    ? interpolate(frame, [impactFrame, impactFrame + 7], [1, 0])
    : 0;

  // Wordmark springs in after slam
  const wordS = spring({
    frame: frame - 14,
    fps,
    config: { damping: 15, stiffness: 130 },
  });
  const tagS = spring({
    frame: frame - 26,
    fps,
    config: { damping: 16, stiffness: 110 },
  });

  // Light streaks sweeping diagonally
  const streakX = interpolate(frame, [6, 42], [-70, 150], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* shockwave rings */}
      {[r1, r2].map((r, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: r.size,
            height: r.size,
            borderRadius: "50%",
            border: `2.5px solid ${COLORS.emeraldBright}`,
            boxShadow: `0 0 60px ${COLORS.emerald}88, inset 0 0 40px ${COLORS.emerald}44`,
            opacity: r.opacity,
          }}
        />
      ))}

      {/* light streaks */}
      <div
        style={{
          position: "absolute",
          top: "-25%",
          left: `${streakX}%`,
          width: "34%",
          height: "150%",
          background: `linear-gradient(105deg, transparent, ${COLORS.emeraldBright}44 45%, #ffffff22 52%, transparent)`,
          filter: "blur(30px)",
          transform: "rotate(14deg)",
          mixBlendMode: "screen",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: `scale(${scale}) translateX(${
            glitchAmp ? (random(`tj-${frame}`) - 0.5) * 22 * glitchAmp : 0
          }px)`,
          filter: glitchAmp
            ? `drop-shadow(${6 * glitchAmp}px 0 0 rgba(255,0,80,0.6)) drop-shadow(${
                -6 * glitchAmp
              }px 0 0 rgba(0,220,255,0.6))`
            : `drop-shadow(0 0 70px ${COLORS.emerald}66)`,
        }}
      >
        <Logo size={188} />
        <div
          style={{
            marginTop: 42,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 118,
            letterSpacing: "-0.02em",
            color: COLORS.zinc100,
            opacity: wordS,
            transform: `translateY(${(1 - wordS) * 46}px)`,
            textShadow: "0 14px 80px rgba(0,0,0,0.9)",
          }}
        >
          Trust
          <span
            style={{
              color: COLORS.emeraldBright,
              textShadow: `0 0 50px ${COLORS.emerald}aa`,
            }}
          >
            Ticker
          </span>
        </div>
        <div
          style={{
            marginTop: 16,
            fontFamily: FONT_BODY,
            fontSize: 31,
            fontWeight: 500,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: COLORS.zinc400,
            opacity: tagS,
            transform: `translateY(${(1 - tagS) * 26}px)`,
          }}
        >
          The market-news workspace
        </div>
      </div>
    </AbsoluteFill>
  );
};
