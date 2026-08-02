/**
 * Exponential backoff with full jitter for provider reconnects.
 * Pure — callers inject Math.random for tests.
 */

export interface BackoffOptions {
  attempt: number; // 0-based
  baseMs?: number;
  maxMs?: number;
  random?: () => number; // [0,1)
}

export function reconnectDelayMs(opts: BackoffOptions): number {
  const base = opts.baseMs ?? 500;
  const max = opts.maxMs ?? 30_000;
  const attempt = Math.max(0, opts.attempt);
  const exp = Math.min(max, base * 2 ** attempt);
  const rand = opts.random ?? Math.random;
  // Full jitter: uniform in [0, exp]
  return Math.floor(rand() * exp);
}

export interface ReconnectControllerOptions {
  baseMs?: number;
  maxMs?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Tracks reconnect attempts and produces delay + health metadata.
 */
export class ReconnectController {
  private attempt = 0;
  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: ReconnectControllerOptions = {}) {
    this.baseMs = opts.baseMs ?? 500;
    this.maxMs = opts.maxMs ?? 30_000;
    this.random = opts.random ?? Math.random;
    this.sleep =
      opts.sleep ??
      ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  getAttempt(): number {
    return this.attempt;
  }

  reset(): void {
    this.attempt = 0;
  }

  nextDelayMs(): number {
    const delay = reconnectDelayMs({
      attempt: this.attempt,
      baseMs: this.baseMs,
      maxMs: this.maxMs,
      random: this.random,
    });
    this.attempt += 1;
    return delay;
  }

  async waitAndReconnect(
    connect: () => Promise<void>
  ): Promise<{ attempt: number; delayMs: number }> {
    const delayMs = this.nextDelayMs();
    await this.sleep(delayMs);
    await connect();
    return { attempt: this.attempt, delayMs };
  }
}
