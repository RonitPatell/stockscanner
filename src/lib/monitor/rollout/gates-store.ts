/**
 * Expansion gate attestations (Redis + memory).
 */

import { getRedis } from "@/lib/redis";
import {
  emptyExpansionGates,
  sanitizeExpansionGates,
  type ExpansionGateState,
} from "@/domain/monitor/rollout";

const KEY = "tt:monitor:rollout:v1:expansion_gates";

const g = globalThis as typeof globalThis & {
  __ttMonitorExpansionGates?: ExpansionGateState;
};

export async function loadExpansionGates(): Promise<ExpansionGateState> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<ExpansionGateState>(KEY);
      const sanitized = sanitizeExpansionGates(raw);
      g.__ttMonitorExpansionGates = sanitized;
      return sanitized;
    } catch {
      /* fall through */
    }
  }
  if (!g.__ttMonitorExpansionGates) {
    g.__ttMonitorExpansionGates = emptyExpansionGates();
  }
  return g.__ttMonitorExpansionGates;
}

export async function saveExpansionGates(
  gates: ExpansionGateState
): Promise<ExpansionGateState> {
  const sanitized = sanitizeExpansionGates(gates);
  g.__ttMonitorExpansionGates = sanitized;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(KEY, sanitized, { ex: 90 * 24 * 3600 });
    } catch {
      /* memory */
    }
  }
  return sanitized;
}

/** Clear all gates after a successful stage advance (force re-attest). */
export async function resetExpansionGates(): Promise<ExpansionGateState> {
  return saveExpansionGates(emptyExpansionGates());
}

export function __resetExpansionGatesForTests(): void {
  g.__ttMonitorExpansionGates = emptyExpansionGates();
}
