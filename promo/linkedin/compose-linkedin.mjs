/**
 * Compose a polished LinkedIn demo MP4 (1920x1080) from real UI screenshots.
 * Slow Ken Burns moves, true xfade crossfades between scenes, calm ASS
 * captions, brand watermark, closing disclaimer.
 *
 * Usage: node promo/linkedin/compose-linkedin.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "..", "tiktok", "shots");
const OUT = join(__dirname, "videos");
const TMP = join(__dirname, ".tmp");
const ASS_DIR = join(__dirname, ".ass");

const FFMPEG =
  process.env.FFMPEG_PATH ||
  "C:\\Users\\Ronpa\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe";

const FPS = 30;
const W = 1920;
const H = 1080;
const XFADE = 0.8; // seconds of crossfade between scenes

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(ASS_DIR, { recursive: true });

function escPath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function toAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function run(args, label) {
  const res = spawnSync(FFMPEG, args, { encoding: "utf8" });
  if (res.status !== 0) {
    console.error(res.stderr?.slice(-1200));
    throw new Error(`ffmpeg failed: ${label}`);
  }
}

/**
 * Render one Ken Burns clip from a screenshot.
 * Screenshots are 2160x1350 (16:10) — crop to 16:9 first, then upscale
 * before zoompan so subpixel motion stays smooth.
 */
function renderClip(scene, idx) {
  const src = join(SHOTS, `${scene.shot}.png`);
  if (!existsSync(src)) throw new Error(`Missing shot: ${scene.shot}`);
  const clip = join(TMP, `clip_${idx}.mp4`);
  const frames = Math.round(scene.dur * FPS);
  const zoom = scene.zoom || "in";
  const focus = scene.focus || "center";

  // Slow, premium zoom (~9%/scene max)
  let zExpr = "min(1.0+0.0009*on,1.14)";
  if (zoom === "out") zExpr = "if(eq(on,1),1.16,max(1.16-0.0009*on,1.02))";
  if (zoom === "panL" || zoom === "panR") zExpr = "1.12";

  let xExpr = "(iw-iw/zoom)/2";
  let yExpr = "(ih-ih/zoom)/2";
  if (focus === "top") yExpr = "(ih-ih/zoom)/4";
  if (focus === "bottom") yExpr = "(ih-ih/zoom)*0.72";
  if (focus === "left") xExpr = "(iw-iw/zoom)/5";
  if (focus === "right") xExpr = "(iw-iw/zoom)*0.75";
  if (zoom === "panL") xExpr = `(iw-iw/zoom)*(0.7-0.4*on/${frames})`;
  if (zoom === "panR") xExpr = `(iw-iw/zoom)*(0.3+0.4*on/${frames})`;

  const vf = [
    // crop 16:10 screenshot to 16:9
    "crop=iw:iw*9/16",
    // upscale so zoompan has subpixel headroom
    "scale=4320:-2",
    `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${W}x${H}:fps=${FPS}`,
    // gentle grade — less punchy than the TikTok pipeline
    "eq=contrast=1.05:saturation=1.04:brightness=0.015",
    "vignette=PI/6",
    "format=yuv420p",
  ].join(",");

  run(
    [
      "-y",
      "-loop", "1",
      "-i", src,
      "-vf", vf,
      "-t", String(scene.dur),
      "-r", String(FPS),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      clip,
    ],
    `clip #${idx} (${scene.shot})`
  );
  return clip;
}

function buildCaptionsAss(captions, totalDur) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Segoe UI Semibold,52,&H00FFFFFF,&H000000FF,&H00101010,&H96000000,0,0,0,0,100,100,0.5,0,1,2.5,1,2,120,120,72,1
Style: Brand,Segoe UI,30,&H00C8C8C8,&H000000FF,&H00101010,&H80000000,0,0,0,0,100,100,1,0,1,1.5,0,9,40,44,34,1
Style: Disc,Segoe UI,26,&H009A9A9A,&H000000FF,&H00101010,&H80000000,0,0,0,0,100,100,0.5,0,1,1.5,0,2,40,40,26,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = [
    // persistent brand watermark, top-right
    `Dialogue: 1,${toAssTime(0)},${toAssTime(totalDur)},Brand,,0,0,0,,TrustTicker`,
    // closing disclaimer
    `Dialogue: 1,${toAssTime(Math.max(0, totalDur - 5))},${toAssTime(totalDur)},Disc,,0,0,0,,Informational only · Not financial advice`,
  ];
  for (const c of captions) {
    events.push(
      `Dialogue: 0,${toAssTime(c.start)},${toAssTime(c.end)},Cap,,0,0,0,,{\\fad(280,280)}${c.text.replace(/\n/g, "\\N")}`
    );
  }
  return header + events.join("\n") + "\n";
}

/**
 * Scenes play in order with XFADE seconds of crossfade between each.
 * Each scene's caption is timed automatically against the final timeline.
 */
const SCENES = [
  {
    shot: "landing-hero", dur: 6.5, zoom: "in", focus: "top",
    caption: "One workspace for market news",
  },
  {
    shot: "demo-wide", dur: 6.5, zoom: "panR", focus: "center",
    caption: "Your full desk, at a glance",
  },
  {
    shot: "demo-wire", dur: 7.5, zoom: "in", focus: "left",
    caption: "Wire alerts, as headlines cross",
  },
  {
    shot: "demo-feed", dur: 7.5, zoom: "in", focus: "right",
    caption: "A live feed with context",
  },
  {
    shot: "demo-volume", dur: 7.0, zoom: "in", focus: "right",
    caption: "Market activity, monitored calmly",
  },
  {
    shot: "today-setups", dur: 7.0, zoom: "in", focus: "center",
    caption: "A free daily briefing — one short focus list",
  },
  {
    shot: "pricing-cards", dur: 6.5, zoom: "in", focus: "center",
    caption: "Try the free demo · Start a free trial",
  },
  {
    shot: "landing-hero", dur: 5.5, zoom: "out", focus: "top",
    caption: "trustticker.com",
  },
];

const OUT_NAME = "trustticker-linkedin-demo.mp4";

function main() {
  if (!existsSync(FFMPEG)) {
    console.error("ffmpeg missing at", FFMPEG);
    process.exit(1);
  }

  console.log("Rendering clips…");
  const clips = SCENES.map((s, i) => {
    console.log(`  [${i + 1}/${SCENES.length}] ${s.shot}`);
    return renderClip(s, i);
  });

  // Scene start times in the final (crossfaded) timeline
  const starts = [];
  let t = 0;
  SCENES.forEach((s, i) => {
    starts.push(t);
    t += s.dur - (i < SCENES.length - 1 ? XFADE : 0);
  });
  const totalDur = t;

  const captions = SCENES.map((s, i) => ({
    start: starts[i] + (i === 0 ? 0.6 : 0.5),
    end: starts[i] + s.dur - (i === SCENES.length - 1 ? 0.4 : 1.0),
    text: s.caption,
  }));

  const assPath = join(ASS_DIR, `${OUT_NAME}.ass`);
  writeFileSync(assPath, buildCaptionsAss(captions, totalDur), "utf8");

  // Single pass: chain xfades across all clips, then burn captions
  const inputs = clips.flatMap((c) => ["-i", c]);
  const filters = [];
  let prevLabel = "0:v";
  let offset = 0;
  for (let i = 1; i < clips.length; i++) {
    offset += SCENES[i - 1].dur - XFADE;
    const outLabel = i === clips.length - 1 ? "xf" : `v${i}`;
    filters.push(
      `[${prevLabel}][${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}[${outLabel}]`
    );
    prevLabel = outLabel;
  }
  filters.push(`[xf]ass='${escPath(assPath)}'[vout]`);

  const finalPath = join(OUT, OUT_NAME);
  console.log("Crossfading + burning captions…");
  run(
    [
      "-y",
      ...inputs,
      "-filter_complex", filters.join(";"),
      "-map", "[vout]",
      "-r", String(FPS),
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-preset", "medium",
      "-crf", "18",
      "-movflags", "+faststart",
      finalPath,
    ],
    "final xfade + captions"
  );

  console.log(`✓ ${OUT_NAME} (${totalDur.toFixed(1)}s) → ${finalPath}`);
}

main();
