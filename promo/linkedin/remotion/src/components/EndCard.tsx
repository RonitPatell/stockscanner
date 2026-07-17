import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FONT_BODY, FONT_DISPLAY } from "../lib/fonts";
import { COLORS } from "../lib/theme";
import { Logo } from "./Logo";

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = (delay: number, cfg = { damping: 14, stiffness: 140 }) =>
    spring({ frame: frame - delay, fps, config: cfg });

  const logoS = pop(0);
  const urlS = pop(10);
  const chipsS = pop(22);
  const discS = pop(34, { damping: 18, stiffness: 100 });

  const ringT = interpolate(frame, [0, 60], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* halo ring */}
      <div
        style={{
          position: "absolute",
          width: 620 + ringT * 260,
          height: 620 + ringT * 260,
          borderRadius: "50%",
          border: `1.5px solid ${COLORS.emerald}44`,
          boxShadow: `0 0 120px ${COLORS.emerald}22, inset 0 0 90px ${COLORS.emerald}18`,
          opacity: 0.9 - ringT * 0.5,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 34,
        }}
      >
        <div
          style={{
            transform: `scale(${0.5 + logoS * 0.5})`,
            opacity: logoS,
            filter: `drop-shadow(0 0 60px ${COLORS.emerald}77)`,
          }}
        >
          <Logo size={150} />
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 108,
            letterSpacing: "-0.02em",
            color: COLORS.zinc100,
            opacity: urlS,
            transform: `translateY(${(1 - urlS) * 40}px)`,
            textShadow: "0 16px 90px rgba(0,0,0,0.9)",
          }}
        >
          trustticker
          <span style={{ color: COLORS.emeraldBright }}>.com</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 20,
            opacity: chipsS,
            transform: `translateY(${(1 - chipsS) * 30}px)`,
          }}
        >
          {["Wire alerts", "Live catalyst feed", "Focus tools"].map((t) => (
            <div
              key={t}
              style={{
                fontFamily: FONT_BODY,
                fontWeight: 600,
                fontSize: 27,
                color: COLORS.emeraldBright,
                border: `1.5px solid ${COLORS.emerald}55`,
                background: `${COLORS.emerald}14`,
                borderRadius: 999,
                padding: "13px 30px",
                letterSpacing: "0.04em",
              }}
            >
              {t}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: FONT_BODY,
            fontSize: 21,
            color: COLORS.zinc500,
            opacity: discS,
            letterSpacing: "0.05em",
          }}
        >
          Market-news workspace · Not financial advice · Data shown is illustrative
        </div>
      </div>
    </AbsoluteFill>
  );
};
