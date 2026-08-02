import {
  createMemory,
  stepMachine,
  type SymbolMachineMemory,
} from "./machine.ts";
import type {
  MomentumStateInput,
  MomentumStateSnapshot,
  MomentumStateTransition,
} from "./types.ts";
import { MONITOR_MOMENTUM_STATE_VERSION } from "./version.ts";

export interface MomentumStateEngineOptions {
  maxTransitions?: number;
}

/**
 * Incremental Momentum State Machine engine — per-symbol memory.
 * Deterministic, causal (no future data), never labels buy/sell opportunities.
 */
export class MomentumStateMachineEngine {
  readonly version = MONITOR_MOMENTUM_STATE_VERSION;
  private readonly mem = new Map<string, SymbolMachineMemory>();
  private readonly transitions: MomentumStateTransition[] = [];
  private readonly maxTransitions: number;

  constructor(opts: MomentumStateEngineOptions = {}) {
    this.maxTransitions = opts.maxTransitions ?? 2_000;
  }

  /**
   * Recompute one symbol incrementally from the latest observables.
   */
  update(input: MomentumStateInput): {
    snapshot: MomentumStateSnapshot;
    transition: MomentumStateTransition | null;
  } {
    const symbol = input.symbol.toUpperCase();
    const prev = this.mem.get(symbol) ?? createMemory();
    const { snapshot, transition, memory } = stepMachine(prev, {
      ...input,
      symbol,
    });
    this.mem.set(symbol, memory);
    if (transition) {
      this.transitions.push(transition);
      if (this.transitions.length > this.maxTransitions) {
        this.transitions.splice(
          0,
          this.transitions.length - this.maxTransitions
        );
      }
    }
    return { snapshot, transition };
  }

  getState(symbol: string): MomentumLifecycleView | null {
    const m = this.mem.get(symbol.toUpperCase());
    if (!m || m.state == null) return null;
    return {
      symbol: symbol.toUpperCase(),
      state: m.state,
      sinceMs: m.sinceMs,
      lastAsOfMs: m.lastAsOfMs,
      calcVersion: MONITOR_MOMENTUM_STATE_VERSION,
    };
  }

  listTransitions(opts?: {
    symbol?: string;
    limit?: number;
  }): MomentumStateTransition[] {
    let out = this.transitions;
    if (opts?.symbol) {
      const s = opts.symbol.toUpperCase();
      out = out.filter((t) => t.symbol === s);
    }
    const lim = opts?.limit ?? out.length;
    return out.slice(-lim);
  }

  reset(symbol?: string): void {
    if (symbol) this.mem.delete(symbol.toUpperCase());
    else this.mem.clear();
  }
}

export interface MomentumLifecycleView {
  symbol: string;
  state: NonNullable<SymbolMachineMemory["state"]>;
  sinceMs: number;
  lastAsOfMs: number;
  calcVersion: string;
}
