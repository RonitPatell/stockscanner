import { recordDeliveryLifecycle } from "./delivery-log.ts";
import { claimChannelDelivery } from "./events.ts";
import { isAlertStale, staleReason } from "./stale.ts";
import type { AlertChannel, AlertQueueClass } from "./types.ts";

export type ChannelSendFn = () => Promise<boolean>;

export interface IsolatedChannelJob {
  channel: AlertChannel;
  userId: string;
  eventId: string;
  eventVersion: number;
  catalystId: string;
  queue: AlertQueueClass | string;
  publishedAt: string;
  /** Priority: browser/in_app first; others run in parallel after. */
  priority: "immediate" | "async";
  send: ChannelSendFn;
  cooldownMs?: number;
}

export interface ChannelDispatchResult {
  channel: AlertChannel;
  status: "delivered" | "failed" | "skipped" | "expired" | "duplicate";
  error?: string;
}

/**
 * Browser / in-app first, then Discord / email / SMS / push independently.
 * One slow vendor never blocks another (Promise.allSettled per async group).
 */
export async function dispatchChannelsIsolated(
  jobs: IsolatedChannelJob[]
): Promise<ChannelDispatchResult[]> {
  const results: ChannelDispatchResult[] = [];

  const immediate = jobs.filter((j) => j.priority === "immediate");
  const asyncJobs = jobs.filter((j) => j.priority === "async");

  for (const job of immediate) {
    results.push(await runOne(job));
  }

  if (asyncJobs.length > 0) {
    const settled = await Promise.allSettled(asyncJobs.map((j) => runOne(j)));
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
      else {
        results.push({
          channel: "discord",
          status: "failed",
          error: String(s.reason).slice(0, 200),
        });
      }
    }
  }

  return results;
}

async function runOne(job: IsolatedChannelJob): Promise<ChannelDispatchResult> {
  if (
    isAlertStale({
      publishedAt: job.publishedAt,
      queue: job.queue,
    })
  ) {
    await recordDeliveryLifecycle({
      eventId: job.eventId,
      eventVersion: job.eventVersion,
      userId: job.userId,
      catalystId: job.catalystId,
      channel: job.channel,
      status: "expired",
      error: staleReason({
        publishedAt: job.publishedAt,
        queue: job.queue,
      }),
    });
    return { channel: job.channel, status: "expired" };
  }

  await recordDeliveryLifecycle({
    eventId: job.eventId,
    eventVersion: job.eventVersion,
    userId: job.userId,
    catalystId: job.catalystId,
    channel: job.channel,
    status: "accepted",
  });

  const claimed = await claimChannelDelivery({
    eventId: job.eventId,
    version: job.eventVersion,
    userId: job.userId,
    channel: job.channel,
    omitVersion: true,
    ttlMs: job.cooldownMs ?? 24 * 60 * 60_000,
  });

  if (!claimed) {
    return { channel: job.channel, status: "duplicate" };
  }

  await recordDeliveryLifecycle({
    eventId: job.eventId,
    eventVersion: job.eventVersion,
    userId: job.userId,
    catalystId: job.catalystId,
    channel: job.channel,
    status: "queued",
  });

  try {
    const ok = await job.send();
    await recordDeliveryLifecycle({
      eventId: job.eventId,
      eventVersion: job.eventVersion,
      userId: job.userId,
      catalystId: job.catalystId,
      channel: job.channel,
      status: ok ? "delivered" : "failed",
      error: ok ? null : "send_returned_false",
    });
    return {
      channel: job.channel,
      status: ok ? "delivered" : "failed",
      error: ok ? undefined : "send_returned_false",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordDeliveryLifecycle({
      eventId: job.eventId,
      eventVersion: job.eventVersion,
      userId: job.userId,
      catalystId: job.catalystId,
      channel: job.channel,
      status: "failed",
      error: msg,
    });
    return { channel: job.channel, status: "failed", error: msg };
  }
}
