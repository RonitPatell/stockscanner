/**
 * Renders vertical (1080x1920) kinetic-caption MP4s for TikTok VOs.
 * Usage: node promo/tiktok/render-videos.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "videos");
const ASS_DIR = join(__dirname, ".ass");

const FFMPEG =
  process.env.FFMPEG_PATH ||
  "C:\\Users\\Ronpa\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe";

/** @typedef {{ start: number, end: number, lines: string[], accent?: boolean }} Beat */

/** @type {{ id: string, file: string, beats: Beat[], duration: number }[]} */
const VIDEOS = [
  {
    id: "01",
    file: "01-youre-late.mp4",
    duration: 30,
    beats: [
      { start: 0, end: 2, lines: ["YOU'RE NOT BAD", "AT TRADING"], accent: true },
      { start: 2, end: 5, lines: ["YOU'RE JUST LATE"] },
      { start: 5, end: 10, lines: ["NEWS → TWITTER → YOU"] },
      { start: 10, end: 16, lines: ["TRUSTTICKER", "WIRE ~2s"], accent: true },
      { start: 16, end: 24, lines: ["SEE IT", "REVIEW OR CAUTION"] },
      { start: 24, end: 30, lines: ["7-DAY FREE TRIAL", "trustticker.com"], accent: true },
    ],
  },
  {
    id: "02",
    file: "02-dilution-trap.mp4",
    duration: 30,
    beats: [
      { start: 0, end: 2, lines: ["STOP CHASING", "GREEN"], accent: true },
      { start: 2, end: 7, lines: ["OFFERING / ATM", "= TRAP"] },
      { start: 7, end: 14, lines: ["DILUTION RADAR", "ON"], accent: true },
      { start: 14, end: 22, lines: ["CAUTION = KEEP", "YOUR MONEY"] },
      { start: 22, end: 30, lines: ["JUDGMENT > HYPE", "7-DAY TRIAL"], accent: true },
    ],
  },
  {
    id: "03",
    file: "03-session-plan.mp4",
    duration: 30,
    beats: [
      { start: 0, end: 2, lines: ["TOO MANY", "TICKERS?"], accent: true },
      { start: 2, end: 6, lines: ["YOU DON'T NEED", "40 IDEAS"] },
      { start: 6, end: 14, lines: ["REVIEW", "CANDIDATES"], accent: true },
      { start: 14, end: 22, lines: ["FREE PLAN", "/today"] },
      { start: 22, end: 30, lines: ["DIRECTION ≠", "BUY / SELL"], accent: true },
    ],
  },
  {
    id: "04",
    file: "04-newbie-roadmap.mp4",
    duration: 32,
    beats: [
      { start: 0, end: 2, lines: ["NEW TO", "DAY TRADING?"], accent: true },
      { start: 2, end: 8, lines: ["SKIP THE", "GURU COURSE"] },
      { start: 8, end: 16, lines: ["SEE → CAUTION → PROVE"], accent: true },
      { start: 16, end: 24, lines: ["MATERIALITY", "DIRECTION · RISK"] },
      { start: 24, end: 32, lines: ["STOP GAMBLING", "START TRIAL"], accent: true },
    ],
  },
  {
    id: "05",
    file: "05-speed-edge.mp4",
    duration: 32,
    beats: [
      { start: 0, end: 2, lines: ["3 MINUTES", "LATE"], accent: true },
      { start: 2, end: 8, lines: ["SAME HEADLINE", "WORSE PRICE"] },
      { start: 8, end: 16, lines: ["SPEED EDGE", "LEDGER"], accent: true },
      { start: 16, end: 24, lines: ["MAKE THE DELAY", "VISIBLE"] },
      { start: 24, end: 32, lines: ["PROVE IT", "7-DAY TRIAL"], accent: true },
    ],
  },
  {
    id: "06",
    file: "06-anti-fomo.mp4",
    duration: 30,
    beats: [
      { start: 0, end: 2, lines: ["HEART", "RACING?"], accent: true },
      { start: 2, end: 7, lines: ["THAT'S NOT", "A SETUP"] },
      { start: 7, end: 15, lines: ["ANTI-FOMO", "SCORE"], accent: true },
      { start: 15, end: 23, lines: ["NEWBIES LOSE", "ON EMOTION"] },
      { start: 23, end: 30, lines: ["JUDGMENT", "STACK"], accent: true },
    ],
  },
  {
    id: "07",
    file: "07-price-math.mp4",
    duration: 32,
    beats: [
      { start: 0, end: 2, lines: ["$19.99", "/ MONTH"], accent: true },
      { start: 2, end: 8, lines: ["ONE BAD CHASE", "COSTS MORE"] },
      { start: 8, end: 16, lines: ["OR $149.99", "/ YEAR"], accent: true },
      { start: 16, end: 24, lines: ["DAILY EDGE", "SHOWS THE MATH"] },
      { start: 24, end: 32, lines: ["7 DAYS FREE", "BOTH PLANS"], accent: true },
    ],
  },
  {
    id: "08",
    file: "08-free-first.mp4",
    duration: 30,
    beats: [
      { start: 0, end: 2, lines: ["FREE", "FIRST"], accent: true },
      { start: 2, end: 8, lines: ["TODAY'S REVIEW", "PLAN"] },
      { start: 8, end: 16, lines: ["BUILD THE HABIT", "BEFORE YOU PAY"], accent: true },
      { start: 16, end: 24, lines: ["WANT IT LIVE?", "GO PRO"] },
      { start: 24, end: 30, lines: ["/today", "THEN TRIAL"], accent: true },
    ],
  },
  {
    id: "09",
    file: "09-prop-desk.mp4",
    duration: 32,
    beats: [
      { start: 0, end: 2, lines: ["NO PROP FIRM", "SEAT NEEDED"], accent: true },
      { start: 2, end: 8, lines: ["YOU NEED", "A DESK"] },
      { start: 8, end: 16, lines: ["PROP DESK", "CALLS · HOTKEYS"], accent: true },
      { start: 16, end: 24, lines: ["SOLO", "NOT LOST"] },
      { start: 24, end: 32, lines: ["TRY THE DESK", "7 DAYS FREE"], accent: true },
    ],
  },
  {
    id: "10",
    file: "10-exit-liquidity.mp4",
    duration: 34,
    beats: [
      { start: 0, end: 3, lines: ["STOP BEING", "EXIT LIQUIDITY"], accent: true },
      { start: 3, end: 10, lines: ["FAST NEWS", "+ CAPITAL CAUTION"] },
      { start: 10, end: 18, lines: ["SEE · REVIEW · PROVE"], accent: true },
      { start: 18, end: 26, lines: ["FREE TRIAL", "MONTHLY OR ANNUAL"] },
      { start: 26, end: 34, lines: ["TRUSTTICKER", "LINK IN BIO"], accent: true },
    ],
  },
];

function toAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(text) {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}

function buildAss(beats) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Arial Black,78,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,6,0,5,60,60,820,1
Style: Accent,Arial Black,78,&H0000E080,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,6,0,5,60,60,820,1
Style: Brand,Arial,36,&H00B0B0B0,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,2,40,40,70,1
Style: Disc,Arial,28,&H00707070,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = [];
  for (const beat of beats) {
    const style = beat.accent ? "Accent" : "Hook";
    const text = beat.lines.map(escapeAss).join("\\N");
    events.push(
      `Dialogue: 0,${toAssTime(beat.start)},${toAssTime(beat.end)},${style},,0,0,0,,{\\fad(120,120)}${text}`
    );
  }
  // persistent brand + disclaimer
  const last = beats[beats.length - 1]?.end ?? 30;
  events.push(
    `Dialogue: 1,${toAssTime(0)},${toAssTime(last)},Brand,,0,0,0,,TrustTicker`
  );
  events.push(
    `Dialogue: 1,${toAssTime(Math.max(0, last - 4))},${toAssTime(last)},Disc,,0,0,0,,Not financial advice · Trading involves risk`
  );

  return header + events.join("\n") + "\n";
}

function renderOne(video) {
  mkdirSync(ASS_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const assPath = join(ASS_DIR, `${video.id}.ass`);
  const outPath = join(OUT_DIR, video.file);
  writeFileSync(assPath, buildAss(video.beats), "utf8");

  // Escape for Windows filter paths in ffmpeg
  const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x09090b:s=1080x1920:d=${video.duration}:r=30`,
    "-f",
    "lavfi",
    "-i",
    `gradients=s=1080x1920:c0=0x052e1f:c1=0x09090b:x0=0:y0=0:x1=0:y1=1920:d=${video.duration}:r=30`,
    "-filter_complex",
    `[1]format=rgba,colorchannelmixer=aa=0.45[g];[0][g]overlay=0:0,ass='${assEscaped}'[v]`,
    "-map",
    "[v]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "fast",
    "-crf",
    "20",
    "-movflags",
    "+faststart",
    outPath,
  ];

  console.log(`Rendering ${video.file}…`);
  const res = spawnSync(FFMPEG, args, { encoding: "utf8" });
  if (res.status !== 0) {
    // Fallback without gradients filter (older ffmpeg / missing filter)
    console.warn(`  gradient failed, retrying solid bg…`);
    const fallback = [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x0a1f16:s=1080x1920:d=${video.duration}:r=30`,
      "-vf",
      `ass='${assEscaped}'`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-movflags",
      "+faststart",
      outPath,
    ];
    const res2 = spawnSync(FFMPEG, fallback, { encoding: "utf8" });
    if (res2.status !== 0) {
      console.error(res2.stderr?.slice(-800) || res.stderr?.slice(-800));
      throw new Error(`Failed: ${video.file}`);
    }
  }
  console.log(`  → ${outPath}`);
}

function main() {
  if (!existsSync(FFMPEG)) {
    console.error("ffmpeg not found at", FFMPEG);
    process.exit(1);
  }
  for (const v of VIDEOS) renderOne(v);
  console.log(`\nDone. ${VIDEOS.length} MP4s in ${OUT_DIR}`);
}

main();
