export type CheckState = "ok" | "degraded" | "down" | "unknown";

export type MarketReadinessInternal = {
  ready: boolean;
  status: "ready" | "degraded" | "not_ready";
  session: string;
  checkedAtMs: number;
  checks: {
    providerConnected: CheckState;
    symbolUniverseLoaded: CheckState;
    previousSessionBaselinesLoaded: CheckState;
    activeSnapshotPublished: CheckState;
    redisReachable: CheckState;
    databaseReachable: CheckState;
    eventStreamWritable: CheckState;
    workerHeartbeat: CheckState;
  };
  detail: {
    snapshotAgeMs: number | null;
    quoteStreamAgeMs: number | null;
    monitorWorkerAgeMs: number | null;
    snapshotId: string | null;
    dataQuality: string | null;
  };
};

export type PublicMarketReadiness = {
  ready: boolean;
  status: "ready" | "degraded" | "not_ready";
  session: string;
  checks: Record<keyof MarketReadinessInternal["checks"], CheckState>;
};
