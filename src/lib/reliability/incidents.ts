import type {
  IncidentEvidence,
  IndicatorId,
  ServiceIncidentRecord,
} from "./types.ts";

/** Only announced-in-advance maintenance is eligible for availability exclusion. */
export function isAdvanceAnnouncedMaintenance(
  incident: Pick<
    ServiceIncidentRecord,
    "announcedMaintenance" | "announcedAt" | "startedAt"
  >
): boolean {
  if (!incident.announcedMaintenance) return false;
  if (!incident.announcedAt) return false;
  return Date.parse(incident.announcedAt) < Date.parse(incident.startedAt);
}

/**
 * Append evidence without mutating prior entries (preserve raw incident evidence).
 */
export function appendIncidentEvidence(
  incident: ServiceIncidentRecord,
  evidence: IncidentEvidence
): ServiceIncidentRecord {
  return {
    ...incident,
    evidence: [...incident.evidence, evidence],
    updatedAt: new Date().toISOString(),
  };
}

export function buildIncidentTimeline(
  incidents: ServiceIncidentRecord[]
): ServiceIncidentRecord[] {
  return [...incidents].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)
  );
}

export function incidentsAffectingComponent(
  incidents: ServiceIncidentRecord[],
  component: IndicatorId,
  atIso: string
): ServiceIncidentRecord[] {
  const at = Date.parse(atIso);
  return incidents.filter((i) => {
    if (!i.components.includes(component)) return false;
    const start = Date.parse(i.startedAt);
    const end = i.endedAt ? Date.parse(i.endedAt) : Infinity;
    return at >= start && at <= end;
  });
}

/** Chargeable outage minutes — excludes advance-announced maintenance. */
export function chargeableOutageMinutes(
  incidents: ServiceIncidentRecord[],
  periodStart: string,
  periodEnd: string
): number {
  const ps = Date.parse(periodStart);
  const pe = Date.parse(periodEnd);
  let mins = 0;
  for (const i of incidents) {
    if (isAdvanceAnnouncedMaintenance(i)) continue;
    if (i.severity === "minor") continue; // credits from major/critical only by default
    const start = Math.max(ps, Date.parse(i.startedAt));
    const end = Math.min(pe, i.endedAt ? Date.parse(i.endedAt) : pe);
    if (end > start) mins += Math.floor((end - start) / 60_000);
  }
  return mins;
}

export function createIncidentDraft(input: {
  id?: string;
  title: string;
  summary: string;
  severity: ServiceIncidentRecord["severity"];
  status?: ServiceIncidentRecord["status"];
  startedAt: string;
  endedAt?: string | null;
  announcedMaintenance?: boolean;
  announcedAt?: string | null;
  components: IndicatorId[];
  sources?: string[];
  evidence?: IncidentEvidence[];
  createdBy?: string | null;
}): ServiceIncidentRecord {
  const now = new Date().toISOString();
  return {
    id: input.id ?? `inc_${Date.now().toString(36)}`,
    title: input.title,
    summary: input.summary,
    severity: input.severity,
    status: input.status ?? "investigating",
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? null,
    announcedMaintenance: input.announcedMaintenance ?? false,
    announcedAt: input.announcedAt ?? null,
    components: input.components,
    sources: input.sources ?? [],
    evidence: input.evidence ?? [],
    affectedSubscriberCount: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
