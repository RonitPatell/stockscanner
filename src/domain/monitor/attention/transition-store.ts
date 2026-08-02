import type { AttentionVariant, LeaderTransition } from "./types.ts";

export class LeaderTransitionStore {
  private readonly items: LeaderTransition[] = [];
  private readonly max: number;

  constructor(max = 500) {
    this.max = max;
  }

  push(t: LeaderTransition): void {
    this.items.push(t);
    if (this.items.length > this.max) {
      this.items.splice(0, this.items.length - this.max);
    }
  }

  list(opts?: {
    variant?: AttentionVariant;
    userScopeId?: string | null;
    limit?: number;
  }): LeaderTransition[] {
    let out = this.items;
    if (opts?.variant) {
      out = out.filter((t) => t.variant === opts.variant);
    }
    if (opts?.userScopeId !== undefined) {
      out = out.filter((t) => t.userScopeId === opts.userScopeId);
    }
    const lim = opts?.limit ?? out.length;
    return out.slice(-lim);
  }

  clear(): void {
    this.items.length = 0;
  }

  get size(): number {
    return this.items.length;
  }
}
