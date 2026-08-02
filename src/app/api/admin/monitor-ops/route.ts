import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  MONITOR_OPS_CONFIRM,
  MonitorOpsConfirmError,
  MonitorOpsValidationError,
  applyMonitorOpsControl,
  requireConfirm,
  type MonitorOpsAction,
} from "@/domain/monitor/ops";
import {
  allExpansionGatesClear,
  missingExpansionGates,
  parseMonitorRolloutStage,
  sanitizeExpansionGates,
} from "@/domain/monitor/rollout";
import {
  buildMonitorOpsDashboard,
  loadMonitorOpsControls,
  saveMonitorOpsControls,
  writeMonitorOpsAudit,
  reprocessBoundedReplayWindow,
  ReprocessBoundsError,
} from "@/lib/monitor/ops";
import {
  loadExpansionGates,
  resetExpansionGates,
  saveExpansionGates,
} from "@/lib/monitor/rollout";

export const dynamic = "force-dynamic";

const GET_LIMIT = 60;
const POST_LIMIT = 20;
const WINDOW_MS = 60_000;

const ACTIONS = new Set<string>(Object.keys(MONITOR_OPS_CONFIRM));

function isAction(v: unknown): v is MonitorOpsAction {
  return typeof v === "string" && ACTIONS.has(v);
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const rl = await rateLimit(
    `admin-monitor-ops:get:${gate.user.id}:${clientIp(req)}`,
    GET_LIMIT,
    WINDOW_MS,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, GET_LIMIT) }
    );
  }

  const dash = await buildMonitorOpsDashboard();
  return NextResponse.json(dash, {
    headers: rateLimitHeaders(rl, GET_LIMIT),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(
    `admin-monitor-ops:post:${gate.user.id}:${ip}`,
    POST_LIMIT,
    WINDOW_MS,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, POST_LIMIT) }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (!isAction(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    if (action === "reprocess_replay_window") {
      requireConfirm(action, body.confirm);

      const result = await reprocessBoundedReplayWindow({
        sessionId: String(body.sessionId ?? ""),
        fromMs: Number(body.fromMs),
        toMs: Number(body.toMs),
        actorUserId: gate.user.id,
      });

      await writeMonitorOpsAudit({
        actorUserId: gate.user.id,
        action,
        confirmToken: MONITOR_OPS_CONFIRM[action],
        detail: { ...result, historicalRewrite: false },
        ip,
      });

      const controls = await loadMonitorOpsControls();
      return NextResponse.json({ ok: true, controls, reprocess: result });
    }

    if (action === "attest_expansion_gates") {
      requireConfirm(action, body.confirm);
      const nextGates = sanitizeExpansionGates(body.gates);
      await saveExpansionGates(nextGates);
      await writeMonitorOpsAudit({
        actorUserId: gate.user.id,
        action,
        confirmToken: MONITOR_OPS_CONFIRM[action],
        detail: {
          gates: nextGates,
          allClear: allExpansionGatesClear(nextGates),
        },
        ip,
      });
      // Controls unchanged — still run through apply for audit consistency token
      const controls = await loadMonitorOpsControls();
      return NextResponse.json({
        ok: true,
        controls,
        expansionGates: nextGates,
      });
    }

    if (action === "set_rollout_stage") {
      requireConfirm(action, body.confirm);
      const requested = String(body.cohortId ?? body.stage ?? "");
      const stage = parseMonitorRolloutStage(requested);
      if (!stage) {
        return NextResponse.json(
          { error: "Invalid rollout stage" },
          { status: 400 }
        );
      }

      const advancing = body.requireGates === true || body.advance === true;
      if (advancing) {
        const gates = await loadExpansionGates();
        if (!allExpansionGatesClear(gates)) {
          return NextResponse.json(
            {
              error: "Expansion gates incomplete",
              missing: missingExpansionGates(gates),
            },
            { status: 400 }
          );
        }
      }

      const prev = await loadMonitorOpsControls();
      const applied = applyMonitorOpsControl(prev, {
        action: "set_rollout_stage",
        confirm: body.confirm,
        cohortId: stage,
      });
      const controls = await saveMonitorOpsControls(applied.controls);
      if (advancing) {
        await resetExpansionGates();
      }

      await writeMonitorOpsAudit({
        actorUserId: gate.user.id,
        action,
        confirmToken: MONITOR_OPS_CONFIRM[action],
        detail: { ...applied.auditDetail, advancing },
        ip,
      });

      return NextResponse.json({ ok: true, controls, stage });
    }

    if (action === "one_click_rollback") {
      const prev = await loadMonitorOpsControls();
      const applied = applyMonitorOpsControl(prev, {
        action,
        confirm: body.confirm,
      });
      const controls = await saveMonitorOpsControls(applied.controls);
      await writeMonitorOpsAudit({
        actorUserId: gate.user.id,
        action,
        confirmToken: MONITOR_OPS_CONFIRM[action],
        detail: applied.auditDetail,
        ip,
      });
      return NextResponse.json({
        ok: true,
        controls,
        fallback: {
          feedHref: "/dashboard?view=feed",
          legacyHref: "/dashboard?shell=legacy",
        },
      });
    }

    const prev = await loadMonitorOpsControls();
    const applied = applyMonitorOpsControl(prev, {
      action,
      confirm: body.confirm,
      providerId: body.providerId,
      calculationVersion: body.calculationVersion,
      symbol: body.symbol,
      cohortId: body.cohortId,
      freezeSymbol: body.freezeSymbol,
    });
    const controls = await saveMonitorOpsControls(applied.controls);

    await writeMonitorOpsAudit({
      actorUserId: gate.user.id,
      action,
      confirmToken: MONITOR_OPS_CONFIRM[action],
      detail: applied.auditDetail,
      ip,
    });

    return NextResponse.json({ ok: true, controls });
  } catch (err) {
    if (err instanceof MonitorOpsConfirmError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (
      err instanceof MonitorOpsValidationError ||
      err instanceof ReprocessBoundsError
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[monitor-ops]", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
