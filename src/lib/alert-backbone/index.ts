export { isAlertBackboneV2Enabled, isPreliminaryPublishEnabled } from "./flags.ts";
export { getServiceTargets, compareTarget, getStaleAgeLimitsMs } from "./targets.ts";
export type * from "./types.ts";
export {
  buildAlertEventId,
  buildChannelIdempotencyKey,
  claimChannelDelivery,
  upsertAlertEventVersion,
  getAlertEvent,
  getEventVersion,
  mapSourceToQueue,
  isProviderTimestampUnreliable,
} from "./events.ts";
export {
  enqueueAlertJob,
  dequeueAlertJob,
  ackAlertJob,
  failAlertJob,
  recoverProcessingJobs,
  getQueueDepths,
  listDlq,
} from "./queues.ts";
export {
  acquireDistributedLock,
  releaseDistributedLock,
} from "./locks.ts";
export {
  recordDeliveryLifecycle,
  listRecentDeliveries,
  channelSuccessRates,
} from "./delivery-log.ts";
export { isAlertStale, staleReason } from "./stale.ts";
export {
  recordSourceHeartbeat,
  getSourceHeartbeat,
  getDataGapsThisHour,
} from "./heartbeats.ts";
export {
  detectAndBackfillGap,
  getSourceCursor,
  setSourceCursor,
} from "./gap-backfill.ts";
export { dispatchChannelsIsolated } from "./channel-dispatch.ts";
export {
  registerPreliminaryAlertEvent,
  markBrowserDelivered,
} from "./preliminary.ts";

/** Heavy modules — import from concrete paths to avoid pulling ingest/prisma into unit tests:
 *  `./metrics`, `./health`, `./probes`, `./worker`
 */
