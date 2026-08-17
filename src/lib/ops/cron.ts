/**
 * Cron success/failure notes for ops stamps + structured logs.
 */

import { opsFail } from "./log.ts";
import {
  incrOpsCounter,
  recordOpsStamp,
  type OpsStampName,
} from "./stats.ts";

export function noteCronOk(
  stamp: OpsStampName,
  meta?: Record<string, string | number | boolean | null>
): void {
  void recordOpsStamp(stamp, meta).catch(() => {});
}

export function noteCronFail(
  job: string,
  err: unknown,
  fields?: Record<string, unknown>
): void {
  opsFail("cron", `${job}_failed`, err, { job, ...fields });
  void incrOpsCounter("cron_fail").catch(() => {});
}
