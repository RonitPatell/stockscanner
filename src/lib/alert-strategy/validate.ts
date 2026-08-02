import { STRATEGY_LIMITS } from "./limits.ts";
import type {
  AlertStrategy,
  StrategyCondition,
  StrategyConditionGroup,
  StrategyValidationIssue,
} from "./types.ts";

function walk(
  group: StrategyConditionGroup,
  path: string,
  visit: (c: StrategyCondition, path: string) => void
): void {
  for (let i = 0; i < group.conditions.length; i++) {
    visit(group.conditions[i]!, `${path}.conditions[${i}]`);
  }
  for (let i = 0; i < (group.groups?.length ?? 0); i++) {
    walk(group.groups![i]!, `${path}.groups[${i}]`, visit);
  }
}

function collectFields(root: StrategyConditionGroup): StrategyCondition[] {
  const out: StrategyCondition[] = [];
  walk(root, "root", (c) => out.push(c));
  return out;
}

/**
 * Validate impossible / contradictory strategy conditions.
 * Errors block save; warnings are advisory.
 */
export function validateStrategy(strategy: AlertStrategy): {
  ok: boolean;
  issues: StrategyValidationIssue[];
} {
  const issues: StrategyValidationIssue[] = [];

  if (!strategy.name?.trim()) {
    issues.push({
      severity: "error",
      code: "NAME_REQUIRED",
      message: "Strategy needs a name.",
      path: "name",
    });
  }

  if (!strategy.channels?.length) {
    issues.push({
      severity: "error",
      code: "CHANNELS_REQUIRED",
      message: "Pick at least one delivery channel.",
      path: "channels",
    });
  }

  if (
    !Number.isFinite(strategy.cooldownMinutes) ||
    strategy.cooldownMinutes < 0 ||
    strategy.cooldownMinutes > 24 * 60
  ) {
    issues.push({
      severity: "error",
      code: "COOLDOWN_RANGE",
      message: "Cooldown must be between 0 and 1440 minutes.",
      path: "cooldownMinutes",
    });
  }

  if (
    strategy.dailyAlertCap != null &&
    (!Number.isFinite(strategy.dailyAlertCap) ||
      strategy.dailyAlertCap < 1 ||
      strategy.dailyAlertCap > 500)
  ) {
    issues.push({
      severity: "error",
      code: "DAILY_CAP_RANGE",
      message: "Daily alert cap must be between 1 and 500 (or empty for unlimited).",
      path: "dailyAlertCap",
    });
  }

  const conditions = collectFields(strategy.root);
  if (conditions.length === 0 && !(strategy.root.groups?.length)) {
    issues.push({
      severity: "error",
      code: "EMPTY_RULES",
      message: "Add at least one condition so the rule can match something.",
      path: "root",
    });
  }

  if (conditions.length > STRATEGY_LIMITS.maxConditions) {
    issues.push({
      severity: "error",
      code: "TOO_MANY_CONDITIONS",
      message: `At most ${STRATEGY_LIMITS.maxConditions} conditions allowed (found ${conditions.length}).`,
      path: "root",
    });
  }

  function depthOf(g: StrategyConditionGroup, d: number): number {
    let max = d;
    for (const child of g.groups ?? []) {
      max = Math.max(max, depthOf(child, d + 1));
    }
    return max;
  }
  const depth = depthOf(strategy.root, 0);
  if (depth > STRATEGY_LIMITS.maxNestingDepth) {
    issues.push({
      severity: "error",
      code: "NESTING_TOO_DEEP",
      message: `Nested groups deeper than ${STRATEGY_LIMITS.maxNestingDepth} levels are not allowed.`,
      path: "root",
    });
  }

  let groupCount = 0;
  function countGroups(g: StrategyConditionGroup) {
    for (const child of g.groups ?? []) {
      groupCount += 1;
      countGroups(child);
    }
  }
  countGroups(strategy.root);
  if (groupCount > STRATEGY_LIMITS.maxGroups) {
    issues.push({
      severity: "error",
      code: "TOO_MANY_GROUPS",
      message: `At most ${STRATEGY_LIMITS.maxGroups} nested groups allowed.`,
      path: "root",
    });
  }

  try {
    const payload = JSON.stringify(strategy);
    if (payload.length > STRATEGY_LIMITS.maxPayloadBytes) {
      issues.push({
        severity: "error",
        code: "PAYLOAD_TOO_LARGE",
        message: `Strategy JSON exceeds ${STRATEGY_LIMITS.maxPayloadBytes} bytes.`,
        path: "root",
      });
    }
  } catch {
    issues.push({
      severity: "error",
      code: "PAYLOAD_UNSERIALIZABLE",
      message: "Strategy could not be serialized for size validation.",
      path: "root",
    });
  }

  if (
    strategy.userNote &&
    strategy.userNote.length > STRATEGY_LIMITS.maxUserNoteChars
  ) {
    issues.push({
      severity: "error",
      code: "NOTE_TOO_LONG",
      message: `Notes must be ≤ ${STRATEGY_LIMITS.maxUserNoteChars} characters.`,
      path: "userNote",
    });
  }

  // Numeric range contradictions within AND groups
  function checkAndGroup(group: StrategyConditionGroup, path: string) {
    if (group.logic === "AND") {
      const byField = new Map<string, StrategyCondition[]>();
      for (const c of group.conditions) {
        const list = byField.get(c.field) ?? [];
        list.push(c);
        byField.set(c.field, list);
      }

      for (const [field, list] of byField) {
        const gtes = list.filter((c) => c.op === "gte").map((c) => Number(c.value));
        const ltes = list.filter((c) => c.op === "lte").map((c) => Number(c.value));
        if (gtes.length && ltes.length) {
          const minGte = Math.min(...gtes.filter(Number.isFinite));
          const maxLte = Math.max(...ltes.filter(Number.isFinite));
          if (Number.isFinite(minGte) && Number.isFinite(maxLte) && minGte > maxLte) {
            issues.push({
              severity: "error",
              code: "IMPOSSIBLE_RANGE",
              message: `${field}: requires ≥ ${minGte} and ≤ ${maxLte} — that range is empty.`,
              path,
            });
          }
        }
        const betweens = list.filter((c) => c.op === "between");
        for (const b of betweens) {
          const v = b.value;
          if (
            Array.isArray(v) &&
            v.length >= 2 &&
            Number(v[0]) > Number(v[1])
          ) {
            issues.push({
              severity: "error",
              code: "BAD_BETWEEN",
              message: `${field}: between low > high.`,
              path,
            });
          }
        }
        // Same field both is_true and is_false
        if (
          list.some((c) => c.op === "is_true") &&
          list.some((c) => c.op === "is_false")
        ) {
          issues.push({
            severity: "error",
            code: "TRUE_AND_FALSE",
            message: `${field}: cannot require both true and false in the same AND group.`,
            path,
          });
        }
      }

      // Delivery / watchlist contradictions
      const needsWatchlist = group.conditions.some(
        (c) => c.field === "watchlist_membership" && c.op === "is_true"
      );
      const needsNotWatchlist = group.conditions.some(
        (c) =>
          (c.field === "watchlist_membership" && c.op === "is_false") ||
          (c.field === "watchlist_membership" &&
            c.op === "eq" &&
            c.value === false)
      );
      if (needsWatchlist && needsNotWatchlist) {
        issues.push({
          severity: "error",
          code: "WATCHLIST_CONTRADICTION",
          message: "Cannot require both on-watchlist and not-on-watchlist in the same AND group.",
          path,
        });
      }
    }

    for (let i = 0; i < (group.groups?.length ?? 0); i++) {
      checkAndGroup(group.groups![i]!, `${path}.groups[${i}]`);
    }
  }
  checkAndGroup(strategy.root, "root");

  // Delivery behaviour vs conditions
  if (strategy.delivery === "RISK_ONLY") {
    const hasRiskSignal = conditions.some(
      (c) =>
        c.field === "dilution_flag" ||
        (c.field === "catalyst_category" &&
          Array.isArray(c.value) &&
          (c.value as string[]).some((v) =>
            /offering|dilution|sec_filing|downgrade/i.test(String(v))
          ))
    );
    if (!hasRiskSignal) {
      issues.push({
        severity: "warning",
        code: "RISK_ONLY_NO_SIGNAL",
        message:
          "RISK_ONLY fires on capital/regulatory risk language — consider adding dilution flags or offering/filing categories.",
        path: "delivery",
      });
    }
  }

  if (strategy.delivery === "EARLY") {
    const requiresConfirmMove = conditions.some(
      (c) =>
        (c.field === "pct_move" || c.field === "relative_volume") &&
        (c.op === "gte" || c.op === "between")
    );
    if (requiresConfirmMove) {
      issues.push({
        severity: "warning",
        code: "EARLY_WITH_CONFIRM",
        message:
          "EARLY alerts before market confirmation, but this rule also requires % move / RVol. Those may delay or block early fires.",
        path: "delivery",
      });
    }
  }

  if (strategy.delivery === "CONFIRMED") {
    const hasConfirm = conditions.some(
      (c) =>
        c.field === "pct_move" ||
        c.field === "relative_volume" ||
        c.field === "dollar_volume" ||
        c.field === "confirmation_count"
    );
    if (!hasConfirm) {
      issues.push({
        severity: "warning",
        code: "CONFIRMED_WEAK",
        message:
          "CONFIRMED expects market confirmation — add % move, RVol, dollar volume, or confirmation count for clearer intent.",
        path: "delivery",
      });
    }
  }

  // Empty nested OR that can never pass
  walk(strategy.root, "root", (c, path) => {
    if (
      (c.op === "in" || c.op === "not_in") &&
      Array.isArray(c.value) &&
      c.value.length === 0
    ) {
      issues.push({
        severity: "error",
        code: "EMPTY_LIST",
        message: `${c.field}: ${c.op} list is empty — nothing can match.`,
        path,
      });
    }
  });

  // Momentum / direction contradictions in AND groups
  function checkMomentumContradiction(
    g: StrategyConditionGroup,
    path: string
  ) {
    if (g.logic === "AND") {
      const pctGte = g.conditions.filter(
        (c) => c.field === "pct_move" && c.op === "gte"
      );
      const pctLte = g.conditions.filter(
        (c) => c.field === "pct_move" && c.op === "lte"
      );
      for (const up of pctGte) {
        for (const down of pctLte) {
          const a = Number(up.value);
          const b = Number(down.value);
          if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b < 0) {
            issues.push({
              severity: "warning",
              code: "DIRECTION_TENSION",
              message:
                "Rule requires both a positive % move floor and a negative % move ceiling in the same AND group — check intent.",
              path,
            });
          }
        }
      }
      const states = g.conditions.filter((c) => c.field === "momentum_state");
      const hasUp = states.some(
        (c) =>
          Array.isArray(c.value) &&
          (c.value as string[]).some((v) =>
            /BREAKING|BUILDING|RECLAIMING|EMERGING/i.test(String(v))
          )
      );
      const hasDown = states.some(
        (c) =>
          Array.isArray(c.value) &&
          (c.value as string[]).some((v) => /FADING|COOLING/i.test(String(v)))
      );
      const pctDown = pctLte.some((c) => Number(c.value) < 0);
      const pctUp = pctGte.some((c) => Number(c.value) > 0);
      if (hasUp && pctDown) {
        issues.push({
          severity: "warning",
          code: "MOMENTUM_DIRECTION_MISMATCH",
          message:
            "Upward momentum states combined with a negative % move filter may rarely match.",
          path,
        });
      }
      if (hasDown && pctUp) {
        issues.push({
          severity: "warning",
          code: "MOMENTUM_DIRECTION_MISMATCH",
          message:
            "Cooling/fading states combined with a positive % move floor may rarely match.",
          path,
        });
      }
      const riskIn = g.conditions.filter(
        (c) => c.field === "risk_flag" && c.op === "in"
      );
      const riskOut = g.conditions.filter(
        (c) => c.field === "risk_flag" && c.op === "not_in"
      );
      for (const inc of riskIn) {
        for (const exc of riskOut) {
          const a = new Set(
            (Array.isArray(inc.value) ? inc.value : []).map((x) =>
              String(x).toLowerCase()
            )
          );
          const b = (
            Array.isArray(exc.value) ? exc.value : []
          ).map((x) => String(x).toLowerCase());
          if (b.some((x) => a.has(x))) {
            issues.push({
              severity: "error",
              code: "RISK_INCLUDE_EXCLUDE",
              message:
                "Same risk flag cannot be both included and excluded in one AND group.",
              path,
            });
          }
        }
      }
    }
    for (let i = 0; i < (g.groups?.length ?? 0); i++) {
      checkMomentumContradiction(g.groups![i]!, `${path}.groups[${i}]`);
    }
  }
  checkMomentumContradiction(strategy.root, "root");

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues };
}
