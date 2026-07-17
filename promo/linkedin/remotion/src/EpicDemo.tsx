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

// ——— Timeline (30fps) ———
const COLD_OPEN = { from: 0, duration: 120 };
const TITLE = { from: 120, duration: 95 };
const HERO = { from: 215, duration: 255 };
const WIRE = { from: 470, duration: 240 };
const FEED = { from: 710, duration: 240 };
const VOLUME = { from: 950, duration: 240 };
const FOCUS = { from: 1190, duration: 240 };
const FINALE = { from: 1430, duration: 195 };
const END = { from: 1625, duration: 210 };

export const TOTAL_FRAMES = END.from + END.duration; // 1835 ≈ 61s

const CUTS = [
  TITLE.from,
  HERO.from,
  WIRE.from,
  FEED.from,
  VOLUME.from,
  FOCUS.from,
  FINALE.from,
  END.from,
];

export const EpicDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#020617" }}>
      {/* ——— Cold open: void + kinetic hook ——— */}
      <Sequence from={COLD_OPEN.from} durationInFrames={COLD_OPEN.duration}>
        <Backdrop grid glow={0.8} />
        <Sequence durationInFrames={62}>
          <KineticCaption
            words={[
              { text: "MARKET" },
              { text: "NEWS" },
              { text: "MOVES" },
              { text: "FAST", accent: true },
            ]}
            size={185}
            outAt={50}
          />
        </Sequence>
        <Sequence from={62} durationInFrames={58}>
          <KineticCaption
            words={[
              { text: "MOST" },
              { text: "DESKS" },
              { text: "DROWN" },
              { text: "IN" },
              { text: "TABS", accent: true },
            ]}
            size={165}
            outAt={48}
          />
        </Sequence>
      </Sequence>

      {/* ——— Logo slam ——— */}
      <Sequence from={TITLE.from} durationInFrames={TITLE.duration}>
        <Backdrop grid={false} glow={1.2} particles={90} />
        <CameraShake amount={2.2} speed={1.4}>
          <TitleCard />
        </CameraShake>
      </Sequence>

      {/* ——— Hero: real desk flies in from the void ——— */}
      <Sequence from={HERO.from} durationInFrames={HERO.duration}>
        <Backdrop grid={false} glow={0.7} particles={40} />
        <HeroFlight src="shots/desk-full.png" />
        <Sequence from={95}>
          <KineticCaption
            words={[{ text: "ONE" }, { text: "DESK", accent: true }]}
            sub="The actual TrustTicker Pro workspace"
            size={135}
            align="bottom"
            outAt={135}
          />
        </Sequence>
      </Sequence>

      {/* ——— Wire alerts ——— */}
      <Sequence from={WIRE.from} durationInFrames={WIRE.duration}>
        <Backdrop grid={false} glow={0.55} particles={30} />
        <CameraShake amount={1.6}>
          <PanelFocus
            src="shots/desk-wire.png"
            focusX={420}
            focusY={330}
            zoomFrom={1.05}
            zoomTo={1.95}
            tiltDir={1}
            whipDir={1}
            durationInFrames={WIRE.duration}
            chips={[
              { text: "BJDX +33.4% · HOD", x: 58, y: 22, tone: "up" },
              { text: "MRNA 4.2× rVol · FDA fast track", x: 62, y: 44, tone: "up", delay: 12 },
              { text: "Timestamped as they print", x: 60, y: 66, tone: "info", delay: 24 },
            ]}
          />
        </CameraShake>
        <KineticCaption
          words={[{ text: "THE" }, { text: "WIRE", accent: true }]}
          sub="Halts · highs of day · volume surges"
          size={120}
          align="bottom"
          outAt={WIRE.duration - 26}
        />
      </Sequence>

      {/* ——— Live feed ——— */}
      <Sequence from={FEED.from} durationInFrames={FEED.duration}>
        <Backdrop grid={false} glow={0.55} particles={30} />
        <CameraShake amount={1.6}>
          <PanelFocus
            src="shots/desk-feed.png"
            focusX={1400}
            focusY={520}
            zoomFrom={1.05}
            zoomTo={1.7}
            tiltDir={-1}
            whipDir={-1}
            durationInFrames={FEED.duration}
            chips={[
              { text: "Scored · clustered · sourced", x: 36, y: 24, tone: "info" },
              { text: "MRNA +16.9% · 3 wire sources", x: 32, y: 46, tone: "up", delay: 12 },
              { text: "RIVN −8.4% · offering flagged", x: 34, y: 68, tone: "down", delay: 24 },
            ]}
          />
        </CameraShake>
        <KineticCaption
          words={[{ text: "LIVE" }, { text: "FEED", accent: true }]}
          sub="Every catalyst — scored and timestamped"
          size={120}
          align="bottom"
          outAt={FEED.duration - 26}
        />
      </Sequence>

      {/* ——— Heavy volume ——— */}
      <Sequence from={VOLUME.from} durationInFrames={VOLUME.duration}>
        <Backdrop grid={false} glow={0.55} particles={30} />
        <CameraShake amount={1.6}>
          <PanelFocus
            src="shots/desk-volume.png"
            focusX={870}
            focusY={330}
            zoomFrom={1.05}
            zoomTo={1.95}
            tiltDir={1}
            whipDir={1}
            durationInFrames={VOLUME.duration}
            chips={[
              { text: "10.6× relative volume", x: 30, y: 24, tone: "up" },
              { text: "Leaders ranked in real time", x: 28, y: 48, tone: "info", delay: 12 },
              { text: "Near-HOD flags on deck", x: 32, y: 70, tone: "up", delay: 24 },
            ]}
          />
        </CameraShake>
        <KineticCaption
          words={[{ text: "HEAVY" }, { text: "VOLUME", accent: true }]}
          sub="rVol leaders surface before they trend"
          size={120}
          align="bottom"
          outAt={VOLUME.duration - 26}
        />
      </Sequence>

      {/* ——— Focus / judgment tools ——— */}
      <Sequence from={FOCUS.from} durationInFrames={FOCUS.duration}>
        <Backdrop grid={false} glow={0.55} particles={30} />
        <CameraShake amount={1.6}>
          <PanelFocus
            src="shots/desk-advanced.png"
            focusX={700}
            focusY={640}
            zoomFrom={1.04}
            zoomTo={1.55}
            tiltDir={-1}
            whipDir={-1}
            durationInFrames={FOCUS.duration}
            chips={[
              { text: "Dilution radar", x: 68, y: 26, tone: "info" },
              { text: "Call board — no hindsight edits", x: 70, y: 48, tone: "up", delay: 12 },
              { text: "Daily edge recap", x: 66, y: 70, tone: "info", delay: 24 },
            ]}
          />
        </CameraShake>
        <KineticCaption
          words={[{ text: "FOCUS", accent: true }, { text: "TOOLS" }]}
          sub="Dilution · calls · edge · replay"
          size={120}
          align="bottom"
          outAt={FOCUS.duration - 26}
        />
      </Sequence>

      {/* ——— Finale: layers separate in 3D ——— */}
      <Sequence from={FINALE.from} durationInFrames={FINALE.duration}>
        <Backdrop grid glow={0.9} particles={50} />
        <LayeredFinale
          center="shots/desk-full.png"
          left="shots/desk-wire.png"
          right="shots/desk-feed.png"
        />
        <Sequence from={26} durationInFrames={92}>
          <KineticCaption
            words={[
              { text: "WIRE", accent: true },
              { text: "·" },
              { text: "FEED", accent: true },
              { text: "·" },
              { text: "FOCUS", accent: true },
            ]}
            size={112}
            align="bottom"
            outAt={80}
          />
        </Sequence>
        <Sequence from={118}>
          <KineticCaption
            words={[{ text: "ONE" }, { text: "DESK", accent: true }]}
            size={150}
            align="bottom"
            outAt={FINALE.duration - 118 - 16}
          />
        </Sequence>
      </Sequence>

      {/* ——— End card ——— */}
      <Sequence from={END.from} durationInFrames={END.duration}>
        <Backdrop grid={false} glow={1} particles={70} />
        <EndCard />
      </Sequence>

      {/* ——— Global cinematic overlays ——— */}
      {CUTS.map((c) => (
        <LightLeak key={c} from={c - 10} duration={22} />
      ))}
      <GlitchFlash cuts={CUTS} />
      <Scanlines opacity={0.04} />
      <FilmGrain opacity={0.05} />
      <Vignette strength={0.72} />
    </AbsoluteFill>
  );
};
