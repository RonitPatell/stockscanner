/**
 * Monitor Ops controls — Redis when available, process memory otherwise.
 */

import { getRedis } from "@/lib/redis";
import {
  defaultMonitorOpsControls,
  sanitizeControls,
  type MonitorOpsControls,
} from "@/domain/monitor/ops";

const CONTROLS_KEY = "tt:monitor:ops:v1:controls";

const g = globalThis as typeof globalThis & {
  __ttMonitorOpsControls?: MonitorOpsControls;
};

export function getMonitorOpsControlsSync(): MonitorOpsControls {
  return g.__ttMonitorOpsControls ?? defaultMonitorOpsControls();
}

export async function loadMonitorOpsControls(): Promise<MonitorOpsControls> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<MonitorOpsControls>(CONTROLS_KEY);
      const sanitized = sanitizeControls(raw);
      g.__ttMonitorOpsControls = sanitized;
      return sanitized;
    } catch {
      /* fall through */
    }
  }
  if (!g.__ttMonitorOpsControls) {
    g.__ttMonitorOpsControls = defaultMonitorOpsControls();
  }
  return g.__ttMonitorOpsControls;
}

export async function saveMonitorOpsControls(
  controls: MonitorOpsControls
): Promise<MonitorOpsControls> {
  const sanitized = sanitizeControls(controls);
  g.__ttMonitorOpsControls = sanitized;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(CONTROLS_KEY, sanitized, { ex: 30 * 24 * 3600 });
    } catch {
      /* memory still holds */
    }
  }
  return sanitized;
}

export function __resetMonitorOpsControlsForTests(
  controls?: MonitorOpsControls
): void {
  g.__ttMonitorOpsControls = controls
    ? sanitizeControls(controls)
    : defaultMonitorOpsControls();
}
