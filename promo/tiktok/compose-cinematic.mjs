/**
 * Compose cinematic TikTok MP4s from real UI screenshots:
 * Ken Burns zooms, panel-highlight frames, light bottom captions.
 *
 * Usage: node promo/tiktok/compose-cinematic.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "shots");
const OUT = join(__dirname, "videos");
const TMP = join(__dirname, ".tmp");
const ASS_DIR = join(__dirname, ".ass");

const FFMPEG =
  process.env.FFMPEG_PATH ||
  "C:\\Users\\Ronpa\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe";

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

/**
 * @param {{shot: string, dur: number, zoom?: 'in'|'out'|'panL'|'panR', focus?: 'center'|'top'|'bottom'|'left'|'right'}[]} scenes
 * @param {{start:number,end:number,text:string}[]} captions
 * @param {string} outName
 */
function renderVideo(outName, scenes, captions, totalHint) {
  const clipPaths = [];
  scenes.forEach((scene, i) => {
    const src = join(SHOTS, `${scene.shot}.png`);
    if (!existsSync(src)) throw new Error(`Missing shot: ${scene.shot}`);
    const clip = join(TMP, `${outName.replace(".mp4", "")}_${i}.mp4`);
    const frames = Math.max(45, Math.round(scene.dur * 30));
    const zoom = scene.zoom || "in";
    const focus = scene.focus || "center";

    // zoom expression
    let zExpr = "min(1.0+0.0022*on,1.28)";
    if (zoom === "out") zExpr = "if(eq(on,1),1.32,max(1.32-0.0022*on,1.05))";
    if (zoom === "panL" || zoom === "panR") zExpr = "1.18";

    let xExpr = "(iw-iw/zoom)/2";
    let yExpr = "(ih-ih/zoom)/2";
    if (focus === "top") yExpr = "(ih-ih/zoom)/4";
    if (focus === "bottom") yExpr = "(ih-ih/zoom)*0.72";
    if (focus === "left") xExpr = "(iw-iw/zoom)/5";
    if (focus === "right") xExpr = "(iw-iw/zoom)*0.75";
    if (zoom === "panL") xExpr = `(iw-iw/zoom)*(0.75-0.55*on/${frames})`;
    if (zoom === "panR") xExpr = `(iw-iw/zoom)*(0.2+0.55*on/${frames})`;

    // Cover vertical 9:16 with Ken Burns from landscape UI
    const vf = [
      "scale=3200:-2",
      `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=1080x1920:fps=30`,
      "eq=contrast=1.06:saturation=1.12:brightness=0.02",
      // soft vignette
      "vignette=PI/4.5",
    ].join(",");

    const args = [
      "-y",
      "-loop",
      "1",
      "-i",
      src,
      "-vf",
      vf,
      "-t",
      String(scene.dur),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "19",
      clip,
    ];
    const res = spawnSync(FFMPEG, args, { encoding: "utf8" });
    if (res.status !== 0) {
      console.error(res.stderr?.slice(-600));
      throw new Error(`clip failed ${outName} #${i}`);
    }
    clipPaths.push(clip);
  });

  // Build concat with xfade chain
  const listFile = join(TMP, `${outName}.txt`);
  // Simpler + more reliable: concat demuxer (hard cuts). Looks punchy for TikTok.
  writeFileSync(
    listFile,
    clipPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n")
  );

  const totalDur =
    totalHint || scenes.reduce((a, s) => a + s.dur, 0);
  const assPath = join(ASS_DIR, `${outName}.ass`);
  writeFileSync(assPath, buildCaptionsAss(captions, totalDur), "utf8");

  const merged = join(TMP, `${outName}_merged.mp4`);
  let res = spawnSync(
    FFMPEG,
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "fast",
      "-crf",
      "18",
      merged,
    ],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    console.error(res.stderr?.slice(-600));
    throw new Error(`concat failed ${outName}`);
  }

  const finalPath = join(OUT, outName);
  res = spawnSync(
    FFMPEG,
    [
      "-y",
      "-i",
      merged,
      "-vf",
      `ass='${escPath(assPath)}'`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-movflags",
      "+faststart",
      finalPath,
    ],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    console.error(res.stderr?.slice(-800));
    throw new Error(`caption burn failed ${outName}`);
  }
  console.log("✓", outName);
}

function buildCaptionsAss(captions, totalDur) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Arial Black,52,&H00FFFFFF,&H000000FF,&H00000000,&HAA000000,-1,0,0,0,100,100,0,0,1,5,0,2,50,50,220,1
Style: Brand,Arial,30,&H00A0A0A0,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,56,1
Style: Disc,Arial,24,&H00707070,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,28,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = [
    `Dialogue: 1,${toAssTime(0)},${toAssTime(totalDur)},Brand,,0,0,0,,TrustTicker`,
    `Dialogue: 1,${toAssTime(Math.max(0, totalDur - 4))},${toAssTime(totalDur)},Disc,,0,0,0,,Informational only · Not financial advice`,
  ];
  for (const c of captions) {
    events.push(
      `Dialogue: 0,${toAssTime(c.start)},${toAssTime(c.end)},Cap,,0,0,0,,{\\fad(100,100)}${c.text.replace(/\n/g, "\\N")}`
    );
  }
  return header + events.join("\n") + "\n";
}

const VIDEOS = [
  {
    file: "01-youre-late.mp4",
    scenes: [
      { shot: "landing-hero", dur: 3.2, zoom: "in", focus: "top" },
      { shot: "demo-wide", dur: 3.5, zoom: "panR", focus: "center" },
      { shot: "demo-wire", dur: 5.5, zoom: "in", focus: "left" },
      { shot: "demo-feed", dur: 5.5, zoom: "in", focus: "right" },
      { shot: "demo-mobile-wire", dur: 4.5, zoom: "in", focus: "center" },
      { shot: "pricing-cards", dur: 4.5, zoom: "in", focus: "center" },
    ],
    captions: [
      { start: 0.2, end: 3.0, text: "Too many market tabs?" },
      { start: 3.2, end: 6.5, text: "Headlines get buried" },
      { start: 6.8, end: 12.0, text: "One news workspace" },
      { start: 12.2, end: 17.5, text: "Wire + feed, clearer" },
      { start: 22.5, end: 27.0, text: "Free demo · free trial" },
    ],
  },
  {
    file: "02-dilution-trap.mp4",
    scenes: [
      { shot: "demo-volume", dur: 4.0, zoom: "in", focus: "right" },
      { shot: "demo-judgment", dur: 5.0, zoom: "in", focus: "bottom" },
      { shot: "today-skips", dur: 6.0, zoom: "in", focus: "center" },
      { shot: "demo-feed", dur: 5.5, zoom: "panL", focus: "center" },
      { shot: "pricing-annual", dur: 5.0, zoom: "in", focus: "center" },
    ],
    captions: [
      { start: 0.2, end: 3.5, text: "Not every headline" },
      { start: 4.0, end: 8.5, text: "belongs on your list" },
      { start: 9.0, end: 14.5, text: "Sort focus vs pass" },
      { start: 15.0, end: 20.0, text: "Keep the list focused" },
      { start: 21.0, end: 25.5, text: "Free briefing · trial" },
    ],
  },
  {
    file: "03-session-plan.mp4",
    scenes: [
      { shot: "today-full", dur: 4.0, zoom: "in", focus: "top" },
      { shot: "today-setups", dur: 6.5, zoom: "in", focus: "center" },
      { shot: "today-skips", dur: 6.5, zoom: "in", focus: "center" },
      { shot: "demo-session", dur: 5.0, zoom: "in", focus: "top" },
      { shot: "today-mobile", dur: 4.5, zoom: "in", focus: "center" },
    ],
    captions: [
      { start: 0.2, end: 3.5, text: "You don't need 40 names" },
      { start: 4.0, end: 10.0, text: "A short focus list" },
      { start: 10.5, end: 16.5, text: "A short pass list" },
      { start: 17.0, end: 21.5, text: "Free daily briefing" },
      { start: 22.0, end: 26.5, text: "No account needed" },
    ],
  },
  {
    file: "04-newbie-roadmap.mp4",
    scenes: [
      { shot: "landing-mobile", dur: 3.5, zoom: "in", focus: "top" },
      { shot: "landing-features", dur: 5.0, zoom: "panR", focus: "center" },
      { shot: "demo-wire", dur: 5.0, zoom: "in", focus: "left" },
      { shot: "today-skips", dur: 5.0, zoom: "in", focus: "center" },
      { shot: "wins-proof", dur: 5.0, zoom: "in", focus: "center" },
      { shot: "pricing-cards", dur: 4.5, zoom: "in", focus: "center" },
    ],
    captions: [
      { start: 0.2, end: 3.2, text: "New to following markets?" },
      { start: 3.5, end: 8.0, text: "Skip the expensive course" },
      { start: 8.5, end: 13.0, text: "See the headline" },
      { start: 13.5, end: 18.0, text: "Decide what belongs" },
      { start: 18.5, end: 23.0, text: "Keep a calm workspace" },
      { start: 23.5, end: 27.5, text: "Free briefing · trial" },
    ],
  },
  {
    file: "05-speed-edge.mp4",
    scenes: [
      { shot: "wins-proof", dur: 5.5, zoom: "in", focus: "top" },
      { shot: "demo-wire", dur: 5.5, zoom: "in", focus: "left" },
      { shot: "demo-feed", dur: 5.5, zoom: "panR", focus: "center" },
      { shot: "landing-features", dur: 5.0, zoom: "in", focus: "center" },
      { shot: "pricing-monthly", dur: 4.5, zoom: "in", focus: "center" },
    ],
    captions: [
      { start: 0.2, end: 3.5, text: "Headlines move fast" },
      { start: 5.5, end: 10.5, text: "One desk for the wire" },
      { start: 11.0, end: 16.0, text: "Stay current, less refresh" },
      { start: 16.5, end: 21.0, text: "Market news workspace" },
      { start: 22.0, end: 26.0, text: "Demo · free trial" },
    ],
  },
  {
    file: "06-anti-fomo.mp4",
    scenes: [
      { shot: "demo-volume", dur: 4.5, zoom: "in", focus: "right" },
      { shot: "demo-feed", dur: 5.5, zoom: "in", focus: "right" },
      { shot: "today-skips", dur: 6.0, zoom: "in", focus: "center" },
      { shot: "demo-judgment", dur: 5.0, zoom: "in", focus: "bottom" },
      { shot: "pricing-cards", dur: 4.5, zoom: "in", focus: "center" },
    ],
    captions: [
      { start: 0.2, end: 3.5, text: "When a name is everywhere" },
      { start: 4.5, end: 9.5, text: "Pause. Read context." },
      { start: 10.0, end: 15.5, text: "Structure before reacting" },
      { start: 16.0, end: 20.5, text: "Research habit tool" },
      { start: 21.0, end: 25.5, text: "Not a tip line" },
    ],
  },
  {
    file: "07-price-math.mp4",
    scenes: [
      { shot: "pricing-monthly", dur: 5.0, zoom: "in", focus: "center" },
      { shot: "pricing-annual", dur: 6.0, zoom: "in", focus: "center" },
      { shot: "today-skips", dur: 5.0, zoom: "in", focus: "center" },
      { shot: "wins-proof", dur: 5.0, zoom: "in", focus: "center" },
      { shot: "pricing-cards", dur: 5.0, zoom: "out", focus: "center" },
    ],
    captions: [
      { start: 0.2, end: 4.5, text: "Clear software pricing" },
      { start: 5.0, end: 10.5, text: "Monthly or annual" },
      { start: 11.0, end: 15.5, text: "Free trial to try the desk" },
      { start: 16.0, end: 20.5, text: "Same workspace either way" },
      { start: 21.0, end: 25.5, text: "See plans on pricing" },
    ],
  },
  {
    file: "08-free-first.mp4",
    scenes: [
      { shot: "today-mobile", dur: 4.0, zoom: "in", focus: "top" },
      { shot: "today-setups", dur: 6.5, zoom: "in", focus: "center" },
      { shot: "today-skips", dur: 6.0, zoom: "in", focus: "center" },
      { shot: "demo-wide", dur: 5.0, zoom: "panR", focus: "center" },
      { shot: "pricing-cards", dur: 4.5, zoom: "in", focus: "center" },
    ],
    captions: [
      { start: 0.2, end: 3.5, text: "Start free" },
      { start: 4.0, end: 10.0, text: "Public daily briefing" },
      { start: 10.5, end: 16.0, text: "Focus list · pass list" },
      { start: 16.5, end: 21.0, text: "Live desk is optional" },
      { start: 21.5, end: 25.5, text: "Link in bio" },
    ],
  },
  {
    file: "09-prop-desk.mp4",
    scenes: [
      { shot: "demo-clean", dur: 4.0, zoom: "in", focus: "center" },
      { shot: "demo-wire", dur: 5.0, zoom: "in", focus: "left" },
      { shot: "demo-volume", dur: 5.0, zoom: "in", focus: "right" },
      { shot: "demo-feed", dur: 5.5, zoom: "panL", focus: "center" },
      { shot: "demo-mobile", dur: 4.5, zoom: "in", focus: "center" },
      { shot: "pricing-cards", dur: 4.0, zoom: "in", focus: "center" },
    ],
    captions: [
      { start: 0.2, end: 3.5, text: "One organized desk" },
      { start: 4.0, end: 8.5, text: "Less clutter" },
      { start: 9.0, end: 13.5, text: "Wire · volume · feed" },
      { start: 14.0, end: 19.0, text: "Built for focus" },
      { start: 23.0, end: 27.5, text: "Demo · free trial" },
    ],
  },
  {
    file: "10-exit-liquidity.mp4",
    scenes: [
      { shot: "landing-hero", dur: 3.5, zoom: "in", focus: "top" },
      { shot: "demo-wire", dur: 5.0, zoom: "in", focus: "left" },
      { shot: "today-skips", dur: 5.0, zoom: "in", focus: "center" },
      { shot: "wins-proof", dur: 5.0, zoom: "in", focus: "center" },
      { shot: "pricing-annual", dur: 5.0, zoom: "in", focus: "center" },
      { shot: "demo-mobile-wire", dur: 4.5, zoom: "in", focus: "center" },
    ],
    captions: [
      { start: 0.2, end: 3.2, text: "Less noise" },
      { start: 3.5, end: 8.0, text: "Clearer headlines" },
      { start: 8.5, end: 13.0, text: "Filter your list" },
      { start: 13.5, end: 18.0, text: "One market-news desk" },
      { start: 18.5, end: 23.0, text: "Free briefing · trial" },
      { start: 23.5, end: 27.5, text: "TrustTicker" },
    ],
  },
];

function main() {
  if (!existsSync(FFMPEG)) {
    console.error("ffmpeg missing");
    process.exit(1);
  }
  for (const v of VIDEOS) {
    console.log("Rendering", v.file, "…");
    const total = v.scenes.reduce((a, s) => a + s.dur, 0);
    renderVideo(v.file, v.scenes, v.captions, total);
  }
  console.log("\nDone →", OUT);
}

main();
