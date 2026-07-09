/**
 * Runs ingest worker + Alpaca quote stream together for local realtime dev.
 * Usage: npm run realtime:worker
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nodeArgs = ["--env-file=.env"];

function start(script, label) {
  const child = spawn("node", [...nodeArgs, script], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => {
    console.error(`${label} exited with code ${code ?? "?"}`);
    process.exit(code ?? 1);
  });
  return child;
}

console.log("Starting realtime workers (ingest + live quotes)…");
start("scripts/ingest-worker.mjs", "ingest");
start("scripts/quote-stream.mjs", "quotes");
