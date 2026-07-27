import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  getReliabilityDashboard,
  getMonthlyReport,
  loadIncidentsFromDb,
  previewServiceCredits,
  applyServiceCredits,
  findAffectedSubscribers,
  writeCreditAudit,
  createIncidentDraft,
  appendIncidentEvidence,
  type ServiceIncidentRecord,
} from "@/lib/reliability";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "dashboard";
  const hours = Number(searchParams.get("hours") ?? "24");

  if (view === "report") {
    const month =
      searchParams.get("month") ??
      new Date().toISOString().slice(0, 7);
    const report = await getMonthlyReport(month);
    return NextResponse.json(report);
  }

  if (view === "incidents") {
    const incidents = await loadIncidentsFromDb();
    return NextResponse.json({ incidents });
  }

  if (view === "credits") {
    const rows = await prisma.serviceCreditEvaluation.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        amountCents: true,
        billingPeriodStart: true,
        billingPeriodEnd: true,
        incidentIds: true,
        appliedAt: true,
        createdAt: true,
      },
    });
    const audit = await prisma.serviceCreditAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        evaluationId: true,
        actorUserId: true,
        action: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ evaluations: rows, audit });
  }

  const dash = await getReliabilityDashboard(
    [24, 72, 168].includes(hours) ? hours : 24
  );
  const incidents = await loadIncidentsFromDb().catch(() => []);
  const affected = await findAffectedSubscribers().catch(() => []);

  return NextResponse.json({
    ...dash,
    incidents,
    affectedSubscriberCount: affected.length,
  });
}

export async function POST(req: NextRequest) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;

  const ip = clientIp(req);
  const rl = await rateLimit(`reliability-admin:${ip}:${authz.user.id}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "create_incident") {
    const draft = createIncidentDraft({
      title: String(body.title ?? "Incident"),
      summary: String(body.summary ?? ""),
      severity: body.severity === "critical" || body.severity === "minor" ? body.severity : "major",
      startedAt: String(body.startedAt ?? new Date().toISOString()),
      endedAt: body.endedAt ?? null,
      announcedMaintenance: body.announcedMaintenance === true,
      announcedAt: body.announcedAt ?? null,
      components: Array.isArray(body.components) ? body.components : [],
      sources: Array.isArray(body.sources) ? body.sources.map(String) : [],
      evidence: Array.isArray(body.evidence) ? body.evidence : [],
      createdBy: authz.user.id,
    });

    const row = await prisma.serviceIncident.create({
      data: {
        id: draft.id,
        title: draft.title,
        summary: draft.summary,
        severity: draft.severity,
        status: draft.status,
        startedAt: new Date(draft.startedAt),
        endedAt: draft.endedAt ? new Date(draft.endedAt) : null,
        announcedMaintenance: draft.announcedMaintenance,
        announcedAt: draft.announcedAt ? new Date(draft.announcedAt) : null,
        components: draft.components,
        sources: draft.sources,
        evidenceJson: draft.evidence as unknown as Prisma.InputJsonValue,
        createdBy: authz.user.id,
      },
    });

    await writeCreditAudit({
      actorUserId: authz.user.id,
      action: "create_incident",
      detail: { incidentId: row.id, title: row.title },
    });

    return NextResponse.json({ incident: row });
  }

  if (action === "append_evidence") {
    const id = String(body.incidentId ?? "");
    const existing = await prisma.serviceIncident.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const asRecord: ServiceIncidentRecord = {
      id: existing.id,
      title: existing.title,
      summary: existing.summary,
      severity: existing.severity as ServiceIncidentRecord["severity"],
      status: existing.status as ServiceIncidentRecord["status"],
      startedAt: existing.startedAt.toISOString(),
      endedAt: existing.endedAt?.toISOString() ?? null,
      announcedMaintenance: existing.announcedMaintenance,
      announcedAt: existing.announcedAt?.toISOString() ?? null,
      components: existing.components as ServiceIncidentRecord["components"],
      sources: existing.sources,
      evidence: ((existing.evidenceJson as unknown) as ServiceIncidentRecord["evidence"]) ?? [],
      affectedSubscriberCount: existing.affectedSubscriberCount,
      createdBy: existing.createdBy,
      createdAt: existing.createdAt.toISOString(),
      updatedAt: existing.updatedAt.toISOString(),
    };
    const next = appendIncidentEvidence(asRecord, {
      capturedAt: new Date().toISOString(),
      kind: String(body.kind ?? "note"),
      payload: (body.payload && typeof body.payload === "object"
        ? body.payload
        : { note: String(body.note ?? "") }) as Record<string, unknown>,
    });
    await prisma.serviceIncident.update({
      where: { id },
      data: {
        evidenceJson: next.evidence as unknown as Prisma.InputJsonValue,
      },
    });
    await writeCreditAudit({
      actorUserId: authz.user.id,
      action: "append_evidence",
      detail: { incidentId: id },
    });
    return NextResponse.json({ ok: true, evidenceCount: next.evidence.length });
  }

  if (action === "preview_credits") {
    const incidentIds: string[] = Array.isArray(body.incidentIds)
      ? body.incidentIds.map(String)
      : [];
    const all = await loadIncidentsFromDb();
    const incidents = all.filter((i) => incidentIds.includes(i.id));
    if (incidents.length === 0) {
      return NextResponse.json({ error: "No incidents selected" }, { status: 400 });
    }
    const evaluationId =
      typeof body.evaluationId === "string" && body.evaluationId
        ? body.evaluationId
        : `cred_${Date.now().toString(36)}`;
    const preview = await previewServiceCredits({
      evaluationId,
      billingPeriodStart: String(body.billingPeriodStart),
      billingPeriodEnd: String(body.billingPeriodEnd),
      incidents,
      actorUserId: authz.user.id,
      planOverride:
        body.planOverride === "annual" || body.planOverride === "monthly"
          ? body.planOverride
          : undefined,
    });
    return NextResponse.json({ preview });
  }

  if (action === "apply_credits") {
    // Explicit authorized admin action required
    if (body.confirm !== "APPLY_SERVICE_CREDITS") {
      return NextResponse.json(
        {
          error:
            "Confirmation required. Set confirm to APPLY_SERVICE_CREDITS after reviewing the preview.",
        },
        { status: 400 }
      );
    }
    const evaluationId = String(body.evaluationId ?? "");
    if (!evaluationId) {
      return NextResponse.json({ error: "evaluationId required" }, { status: 400 });
    }
    const result = await applyServiceCredits({
      evaluationId,
      actorUserId: authz.user.id,
      dryRun: body.dryRun === true,
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
