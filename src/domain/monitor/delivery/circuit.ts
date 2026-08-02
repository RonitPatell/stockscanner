/**
 * Pure circuit breaker for Monitor source / processing paths.
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitConfig {
  failureThreshold: number;
  coolDownMs: number;
}

export interface CircuitBreaker {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  nextEligibleAt: number;
}

export function createCircuit(): CircuitBreaker {
  return {
    state: "closed",
    consecutiveFailures: 0,
    openedAt: null,
    nextEligibleAt: 0,
  };
}

export function circuitAllows(
  c: CircuitBreaker,
  nowMs: number
): { allow: boolean; state: CircuitState } {
  if (c.state === "open") {
    if (nowMs >= c.nextEligibleAt) {
      c.state = "half_open";
      return { allow: true, state: "half_open" };
    }
    return { allow: false, state: "open" };
  }
  return { allow: true, state: c.state };
}

export function circuitSuccess(c: CircuitBreaker): void {
  c.state = "closed";
  c.consecutiveFailures = 0;
  c.openedAt = null;
  c.nextEligibleAt = 0;
}

export function circuitFailure(
  c: CircuitBreaker,
  cfg: CircuitConfig,
  nowMs: number
): void {
  c.consecutiveFailures += 1;
  if (c.consecutiveFailures >= cfg.failureThreshold || c.state === "half_open") {
    c.state = "open";
    c.openedAt = nowMs;
    c.nextEligibleAt = nowMs + cfg.coolDownMs;
  } else {
    c.nextEligibleAt = nowMs + Math.min(cfg.coolDownMs, 1_000 * c.consecutiveFailures);
  }
}
