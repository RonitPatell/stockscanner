/**
 * Monitor Ops audit — Prisma durable log; memory ring if DB unavailable.
 * Never logs provider secrets.
 */

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MonitorOpsAuditRow } from "@/domain/monitor/ops";

const g = globalThis as typeof globalThis & {
  __ttMonitorOpsAuditMem?: MonitorOpsAuditRow[];
};

const MEM_MAX = 200;

function mem(): MonitorOpsAuditRow[] {
  if (!g.__ttMonitorOpsAuditMem) g.__ttMonitorOpsAuditMem = [];
  return g.__ttMonitorOpsAuditMem;
}

/** Hash IP for audit — never store raw client IP in ops detail. */
export function hashOpsIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`monitor-ops:${ip}`).digest("hex").slice(0, 32);
}

function redactDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (/secret|token|password|apikey|api_key|webhook|authorization/i.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 500)}…`;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export async function writeMonitorOpsAudit(input: {
  actorUserId: string;
  action: string;
  confirmToken?: string | null;
  detail: Record<string, unknown>;
  ip?: string | null;
}): Promise<MonitorOpsAuditRow> {
  const detail = redactDetail(input.detail);
  const ipHash = hashOpsIp(input.ip);
  const row: MonitorOpsAuditRow = {
    id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    actorUserId: input.actorUserId,
    action: input.action,
    confirmToken: input.confirmToken ?? null,
    detail,
    createdAt: new Date().toISOString(),
  };

  try {
    const created = await prisma.monitorOpsAuditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        confirmToken: input.confirmToken ?? null,
        detailJson: detail as Prisma.InputJsonValue,
        ipHash,
      },
      select: {
        id: true,
        actorUserId: true,
        action: true,
        confirmToken: true,
        detailJson: true,
        createdAt: true,
      },
    });
    row.id = created.id;
    row.createdAt = created.createdAt.toISOString();
    row.detail = (created.detailJson as Record<string, unknown>) ?? detail;
  } catch (err) {
    console.error("[monitor-ops-audit] persist failed; using memory ring", err);
    const list = mem();
    list.push(row);
    if (list.length > MEM_MAX) list.splice(0, list.length - MEM_MAX);
  }

  return row;
}

export async function listMonitorOpsAudit(
  limit = 40
): Promise<MonitorOpsAuditRow[]> {
  try {
    const rows = await prisma.monitorOpsAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(100, Math.max(1, limit)),
      select: {
        id: true,
        actorUserId: true,
        action: true,
        confirmToken: true,
        detailJson: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      action: r.action,
      confirmToken: r.confirmToken,
      detail: (r.detailJson as Record<string, unknown>) ?? {},
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return mem().slice(-limit).reverse();
  }
}
