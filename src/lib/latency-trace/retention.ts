import { prisma } from "../prisma.ts";

export function getLatencyTraceRetentionDays(): number {
  const n = Number(process.env.LATENCY_TRACE_RETENTION_DAYS ?? "14");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 14;
}

/** Delete raw latency trace rows older than the retention window. */
export async function cleanupLatencyTraces(
  retentionDays = getLatencyTraceRetentionDays()
): Promise<{ deleted: number; olderThan: string }> {
  const olderThan = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.latencyTrace.deleteMany({
    where: { createdAt: { lt: olderThan } },
  });
  return { deleted: result.count, olderThan: olderThan.toISOString() };
}
