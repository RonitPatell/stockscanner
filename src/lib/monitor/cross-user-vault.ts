/**
 * In-memory ownership vault for cross-user Monitor security regression tests.
 * Mirrors session-scoped private resources (strategies / watchlists / mute).
 * Production APIs must use the same rule: ownerId always from session, never client body.
 */

export type PrivateStrategyBlob = {
  id: string;
  name: string;
  ownerId: string;
  payload: unknown;
};

export type PrivateWatchlist = {
  ownerId: string;
  symbols: string[];
};

/** Reject client-supplied ownership claims — session id wins. */
export function resolveOwnerId(sessionUserId: string, clientClaimedUserId?: unknown): string {
  void clientClaimedUserId; // intentionally ignored
  if (!sessionUserId || typeof sessionUserId !== "string") {
    throw new Error("missing_session_user");
  }
  return sessionUserId;
}

export class CrossUserVault {
  private strategies = new Map<string, PrivateStrategyBlob[]>();
  private watchlists = new Map<string, string[]>();
  private mutes = new Map<string, Set<string>>();

  saveStrategy(sessionUserId: string, draft: Omit<PrivateStrategyBlob, "ownerId">, clientUserId?: unknown) {
    const ownerId = resolveOwnerId(sessionUserId, clientUserId);
    const list = this.strategies.get(ownerId) ?? [];
    const next = {
      ...draft,
      ownerId,
    };
    const idx = list.findIndex((s) => s.id === next.id);
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    this.strategies.set(ownerId, list);
    return next;
  }

  listStrategies(sessionUserId: string, clientUserId?: unknown): PrivateStrategyBlob[] {
    const ownerId = resolveOwnerId(sessionUserId, clientUserId);
    return [...(this.strategies.get(ownerId) ?? [])];
  }

  /** Attempt to read another user's strategy by id — must fail closed. */
  getStrategyForUser(
    sessionUserId: string,
    strategyId: string,
    clientUserId?: unknown
  ): PrivateStrategyBlob | null {
    const ownerId = resolveOwnerId(sessionUserId, clientUserId);
    return (this.strategies.get(ownerId) ?? []).find((s) => s.id === strategyId) ?? null;
  }

  setWatchlist(sessionUserId: string, symbols: string[], clientUserId?: unknown) {
    const ownerId = resolveOwnerId(sessionUserId, clientUserId);
    this.watchlists.set(
      ownerId,
      [...new Set(symbols.map((s) => s.toUpperCase()))].slice(0, 200)
    );
  }

  getWatchlist(sessionUserId: string, clientUserId?: unknown): string[] {
    const ownerId = resolveOwnerId(sessionUserId, clientUserId);
    return [...(this.watchlists.get(ownerId) ?? [])];
  }

  setMutes(sessionUserId: string, symbols: string[], clientUserId?: unknown) {
    const ownerId = resolveOwnerId(sessionUserId, clientUserId);
    this.mutes.set(ownerId, new Set(symbols.map((s) => s.toUpperCase())));
  }

  getMutes(sessionUserId: string, clientUserId?: unknown): string[] {
    const ownerId = resolveOwnerId(sessionUserId, clientUserId);
    return [...(this.mutes.get(ownerId) ?? [])];
  }

  /** Simulate a private strategy/watchlist SSE subscription gate. */
  canSubscribePrivateStream(
    sessionUserId: string,
    resourceOwnerId: string,
    entitled: boolean
  ): boolean {
    if (!entitled) return false;
    return sessionUserId === resourceOwnerId;
  }
}
