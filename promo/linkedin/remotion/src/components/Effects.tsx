import React from "react";
import {
  AbsoluteFill,
  interpolate,
  random,
  useCurrentFrame,
} from "remotion";
import { COLORS } from "../lib/theme";

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E")`;

/** Animated film grain overlay */
export const FilmGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.055 }) => {
  const frame = useCurrentFrame();
  const x = Math.floor(random(`gx-${frame}`) * 200);
  const y = Math.floor(random(`gy-${frame}`) * 200);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: NOISE_SVG,
        backgroundPosition: `${x}px ${y}px`,
        mixBlendMode: "overlay",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};

/** Subtle CRT scanlines */
export const Scanlines: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => (
  <AbsoluteFill
    style={{
      background:
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 4px)",
      opacity,
      pointerEvents: "none",
    }}
  />
);

/** Cinematic vignette */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.8 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 68% 58% at 50% 46%, transparent 55%, rgba(0,0,0,${strength}) 100%)`,
      pointerEvents: "none",
    }}
  />
);

/**
 * Glitch flash + chromatic aberration burst around hard cuts.
 * Pass the global cut frames; renders slices only within ±4 frames of a cut.
 */
export const GlitchFlash: React.FC<{ cuts: number[] }> = ({ cuts }) => {
  const frame = useCurrentFrame();
  const cut = cuts.find((c) => Math.abs(frame - c) <= 4);
  if (cut === undefined) return null;
  const d = Math.abs(frame - cut);
  const intensity = interpolate(d, [0, 4], [1, 0]);
  const slices = 9;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* white flash */}
      <AbsoluteFill
        style={{ background: "#ffffff", opacity: 0.16 * intensity }}
      />
      {/* RGB fringe */}
      <AbsoluteFill
        style={{
          background: "rgba(255,0,60,0.5)",
          mixBlendMode: "screen",
          opacity: 0.1 * intensity,
          transform: `translateX(${10 * intensity}px)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: "rgba(0,220,255,0.5)",
          mixBlendMode: "screen",
          opacity: 0.1 * intensity,
          transform: `translateX(${-10 * intensity}px)`,
        }}
      />
      {/* displaced horizontal slices */}
      {Array.from({ length: slices }).map((_, i) => {
        const off =
          (random(`gl-${cut}-${i}-${frame}`) - 0.5) * 90 * intensity;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${(i / slices) * 100}%`,
              height: `${100 / slices / 2.4}%`,
              background: `linear-gradient(90deg, transparent, ${COLORS.emeraldBright}22, transparent)`,
              transform: `translateX(${off}px)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Sweeping warm/emerald light leak used on transitions */
export const LightLeak: React.FC<{
  from: number;
  duration: number;
}> = ({ from, duration }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > from + duration) return null;
  const t = (frame - from) / duration;
  const x = interpolate(t, [0, 1], [-60, 130]);
  const opacity = interpolate(t, [0, 0.3, 0.7, 1], [0, 0.5, 0.5, 0]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      <div
        style={{
          position: "absolute",
          top: "-30%",
          left: `${x}%`,
          width: "48%",
          height: "160%",
          background: `linear-gradient(100deg, transparent, ${COLORS.emerald}55 35%, #fbbf2433 55%, transparent)`,
          filter: "blur(46px)",
          transform: "rotate(8deg)",
          opacity,
        }}
      />
    </AbsoluteFill>
  );
};

/** Camera-shake wrapper (deterministic, frame-driven) */
export const CameraShake: React.FC<{
  amount?: number;
  speed?: number;
  children: React.ReactNode;
}> = ({ amount = 3, speed = 1, children }) => {
  const frame = useCurrentFrame();
  const x =
    Math.sin(frame * 0.31 * speed) * amount +
    Math.sin(frame * 0.83 * speed) * amount * 0.4;
  const y =
    Math.cos(frame * 0.27 * speed) * amount * 0.8 +
    Math.sin(frame * 0.61 * speed) * amount * 0.35;
  const rot = Math.sin(frame * 0.15 * speed) * amount * 0.02;
  return (
    <AbsoluteFill
      style={{ transform: `translate(${x}px, ${y}px) rotate(${rot}deg)` }}
    >
      {children}
    </AbsoluteFill>
  );
};
