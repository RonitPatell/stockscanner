/**
 * Run workflow audit with harness env (Windows-friendly, no cross-env).
 * Usage: node scripts/run-workflow-audit.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.ALLOW_E2E_HARNESS = "1";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = [
  "playwright",
  "test",
  "e2e/workflow-audit.spec.ts",
  "--project=desktop",
  ...process.argv.slice(2),
];

const child = spawn("npx", args, {
  stdio: "inherit",
  shell: true,
  cwd: root,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 1));
