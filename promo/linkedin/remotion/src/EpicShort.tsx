import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Backdrop } from "./components/Backdrop";
import {
  CameraShake,
  FilmGrain,
  GlitchFlash,
  LightLeak,
  Scanlines,
  Vignette,
} from "./components/Effects";
import { KineticCaption } from "./components/KineticCaption";
import { TitleCard } from "./components/TitleCard";
import { HeroFlight, LayeredFinale } from "./components/DashboardPlane3D";
import { PanelFocus } from "./components/PanelFocus";
import { EndCard } from "./components/EndCard";

/**
 * LinkedIn short cut (~28s @ 30fps). Same desk footage as EpicDemo,
 * tighter cold open and panel beats for feed completion rate.
 */
const COLD = { from: 0, duration: 48 };
const TITLE = { from: 48, duration: 55 };
const HERO = { from: 103, duration: 105 };
const WIRE = { from: 208, duration: 112 };
const FEED = { from: 320, duration: 112 };
const VOLUME = { from: 432, duration: 105 };
const FINALE = { from: 537, duration: 100 };
const END = { from: 637, duration: 113 };

export const SHORT_TOTAL_FRAMES = END.from + END.duration; // 750 ≈ 25.0s

const CUTS = [
  TITLE.from,
  HERO.from,
  WIRE.from,
  FEED.from,
  VOLUME.from,
  FINALE.from,
  END.from,
];

export const EpicShort: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#020617" }}>
      <Sequence from={COLD.from} durationInFrames={COLD.duration}>
        <Backdrop grid glow={0.8} />
        <Sequence durationInFrames={48}>
          <KineticCaption
            words={[
              { text: "MARKET" },
              { text: "NEWS" },
              { text: "MOVES" },
              { text: "FAST", accent: true },
            ]}
            size={175}
            outAt={40}
          />
        </Sequence>
      </Sequence>

      <Sequence from={TITLE.from} durationInFrames={TITLE.duration}>
        <Backdrop grid={false} glow={1.2} particles={90} />
        <CameraShake amount={2.2} speed={1.4}>
          <TitleCard />
        </CameraShake>
      </Sequence>

      <Sequence from={HERO.from} durationInFrames={HERO.duration}>
        <Backdrop grid={false} glow={0.7} particles={40} />
        <HeroFlight src="shots/desk-full.png" />
        <Sequence from={36}>
          <KineticCaption
            words={[{ text: "ONE" }, { text: "DESK", accent: true }]}
            sub="The actual TrustTicker Pro workspace"
            size={128}
            align="bottom"
            outAt={HERO.duration - 36 - 12}
          />
        </Sequence>
      </Sequence>

      <Sequence from={WIRE.from} durationInFrames={WIRE.duration}>
        <Backdrop grid={false} glow={0.55} particles={30} />
        <CameraShake amount={1.6}>
          <PanelFocus
            src="shots/desk-wire.png"
            focusX={420}
            focusY={330}
            zoomFrom={1.05}
            zoomTo={1.85}
            tiltDir={1}
            whipDir={1}
            durationInFrames={WIRE.duration}
            chips={[
              { text: "BJDX +33.4% · HOD", x: 58, y: 22, tone: "up" },
              { text: "MRNA 4.2× rVol · FDA", x: 62, y: 48, tone: "up", delay: 10 },
            ]}
          />
        </CameraShake>
        <KineticCaption
          words={[{ text: "THE" }, { text: "WIRE", accent: true }]}
          sub="Halts · highs of day · volume surges"
          size={112}
          align="bottom"
          outAt={WIRE.duration - 20}
        />
      </Sequence>

      <Sequence from={FEED.from} durationInFrames={FEED.duration}>
        <Backdrop grid={false} glow={0.55} particles={30} />
        <CameraShake amount={1.6}>
          <PanelFocus
            src="shots/desk-feed.png"
            focusX={1400}
            focusY={520}
            zoomFrom={1.05}
            zoomTo={1.65}
            tiltDir={-1}
            whipDir={-1}
            durationInFrames={FEED.duration}
            chips={[
              { text: "Scored · clustered · sourced", x: 36, y: 28, tone: "info" },
              { text: "RIVN −8.4% · offering flagged", x: 34, y: 56, tone: "down", delay: 12 },
            ]}
          />
        </CameraShake>
        <KineticCaption
          words={[{ text: "LIVE" }, { text: "FEED", accent: true }]}
          sub="Every catalyst — scored and timestamped"
          size={112}
          align="bottom"
          outAt={FEED.duration - 20}
        />
      </Sequence>

      <Sequence from={VOLUME.from} durationInFrames={VOLUME.duration}>
        <Backdrop grid={false} glow={0.55} particles={30} />
        <CameraShake amount={1.6}>
          <PanelFocus
            src="shots/desk-volume.png"
            focusX={870}
            focusY={330}
            zoomFrom={1.05}
            zoomTo={1.85}
            tiltDir={1}
            whipDir={1}
            durationInFrames={VOLUME.duration}
            chips={[
              { text: "10.6× relative volume", x: 30, y: 28, tone: "up" },
              { text: "Leaders ranked in real time", x: 28, y: 55, tone: "info", delay: 10 },
            ]}
          />
        </CameraShake>
        <KineticCaption
          words={[{ text: "HEAVY" }, { text: "VOLUME", accent: true }]}
          sub="rVol leaders surface before they trend"
          size={112}
          align="bottom"
          outAt={VOLUME.duration - 20}
        />
      </Sequence>

      <Sequence from={FINALE.from} durationInFrames={FINALE.duration}>
        <Backdrop grid glow={0.9} particles={50} />
        <LayeredFinale
          center="shots/desk-full.png"
          left="shots/desk-wire.png"
          right="shots/desk-feed.png"
        />
        <Sequence from={12} durationInFrames={50}>
          <KineticCaption
            words={[
              { text: "WIRE", accent: true },
              { text: "·" },
              { text: "FEED", accent: true },
              { text: "·" },
              { text: "FOCUS", accent: true },
            ]}
            size={100}
            align="bottom"
            outAt={42}
          />
        </Sequence>
        <Sequence from={58}>
          <KineticCaption
            words={[{ text: "ONE" }, { text: "DESK", accent: true }]}
            size={140}
            align="bottom"
            outAt={FINALE.duration - 58 - 10}
          />
        </Sequence>
      </Sequence>

      <Sequence from={END.from} durationInFrames={END.duration}>
        <Backdrop grid={false} glow={1} particles={70} />
        <EndCard />
      </Sequence>

      {CUTS.map((c) => (
        <LightLeak key={c} from={c - 8} duration={18} />
      ))}
      <GlitchFlash cuts={CUTS} />
      <Scanlines opacity={0.04} />
      <FilmGrain opacity={0.05} />
      <Vignette strength={0.72} />
    </AbsoluteFill>
  );
};
