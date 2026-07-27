export type OnboardingFocus =
  | "small_cap"
  | "biotech"
  | "large_cap"
  | "custom";

export type AlertStyle = "early" | "confirmed" | "risk_only";

export interface OnboardingProgress {
  version: 1;
  skipped?: boolean;
  focus?: OnboardingFocus;
  focusDone?: boolean;
  watchlistDone?: boolean;
  alertsDone?: boolean;
  testAlertDone?: boolean;
  stepsCompleted?: number;
}

export const FOCUS_STARTER_WATCHLISTS: Record<
  Exclude<OnboardingFocus, "custom">,
  string[]
> = {
  small_cap: ["SOFI", "PLTR", "RIVN", "HOOD", "MARA", "SMCI"],
  biotech: ["MRNA", "NVAX", "CRSP", "BEAM", "EDIT", "SAVA"],
  large_cap: ["NVDA", "AAPL", "MSFT", "AMZN", "META", "TSLA"],
};

export function parseOnboardingProgress(raw: unknown): OnboardingProgress {
  if (!raw || typeof raw !== "object") return { version: 1 };
  const o = raw as Record<string, unknown>;
  return {
    version: 1,
    skipped: o.skipped === true,
    focus: o.focus as OnboardingFocus | undefined,
    focusDone: o.focusDone === true,
    watchlistDone: o.watchlistDone === true,
    alertsDone: o.alertsDone === true,
    testAlertDone: o.testAlertDone === true,
    stepsCompleted: typeof o.stepsCompleted === "number" ? o.stepsCompleted : 0,
  };
}

export interface ActivationState {
  watchlistCount: number;
  hasAlertChannel: boolean;
  catalystsExpanded: number;
  testAlertSent: boolean;
  activated: boolean;
  missing: string[];
}

export const ALERT_STYLE_PRESETS: Record<
  AlertStyle,
  {
    label: string;
    description: string;
    mode: "EARLY" | "CONFIRMED" | "RISK_ONLY";
    rule: {
      minChangePercent: number;
      minRvol: number;
      minUrgency: number;
      newsAttachedOnly: boolean;
      cooldownMinutes: number;
    };
  }
> = {
  early: {
    label: "Early",
    description:
      "High-confidence material catalyst — no price confirmation required.",
    mode: "EARLY",
    rule: {
      minChangePercent: 0,
      minRvol: 0,
      minUrgency: 25,
      newsAttachedOnly: true,
      cooldownMinutes: 10,
    },
  },
  confirmed: {
    label: "Confirmed",
    description:
      "Catalyst plus price, volume, and liquidity confirmation when available.",
    mode: "CONFIRMED",
    rule: {
      minChangePercent: 2.5,
      minRvol: 2.0,
      minUrgency: 30,
      newsAttachedOnly: true,
      cooldownMinutes: 15,
    },
  },
  risk_only: {
    label: "Risk-only",
    description:
      "Offerings, dilution, reverse splits, warrants, convertibles, negative regulatory, stale traps.",
    mode: "RISK_ONLY",
    rule: {
      minChangePercent: 0,
      minRvol: 0,
      minUrgency: 0,
      newsAttachedOnly: true,
      cooldownMinutes: 20,
    },
  },
};

export function computeActivation(input: {
  watchlist: string[];
  emailAlertsEnabled?: boolean;
  discordAlertsEnabled?: boolean;
  smsAlertsEnabled?: boolean;
  pushSubscription?: unknown;
  catalystsExpandedCount?: number;
  testAlertSentAt?: Date | string | null;
  activatedAt?: Date | string | null;
}): ActivationState {
  const watchlistCount = input.watchlist.filter(Boolean).length;
  const hasAlertChannel = Boolean(
    input.emailAlertsEnabled ||
      input.discordAlertsEnabled ||
      input.smsAlertsEnabled ||
      input.pushSubscription
  );
  const catalystsExpanded = input.catalystsExpandedCount ?? 0;
  const testAlertSent = Boolean(input.testAlertSentAt);
  const criteriaMet =
    watchlistCount >= 5 &&
    hasAlertChannel &&
    catalystsExpanded >= 3 &&
    testAlertSent;
  const missing: string[] = [];
  if (watchlistCount < 5) missing.push("Add at least 5 watchlist symbols");
  if (!hasAlertChannel) missing.push("Enable one alert channel");
  if (catalystsExpanded < 3) missing.push("Expand 3 catalysts on the desk");
  if (!testAlertSent) missing.push("Send a successful test alert");

  return {
    watchlistCount,
    hasAlertChannel,
    catalystsExpanded,
    testAlertSent,
    activated: criteriaMet || Boolean(input.activatedAt),
    missing,
  };
}

/** Checklist items shown after skip / while incomplete. */
export function onboardingChecklistItems(progress: OnboardingProgress): {
  id: string;
  label: string;
  done: boolean;
}[] {
  return [
    { id: "focus", label: "Choose trading focus", done: Boolean(progress.focusDone) },
    {
      id: "watchlist",
      label: "Add 5+ watchlist symbols",
      done: Boolean(progress.watchlistDone),
    },
    {
      id: "alerts",
      label: "Pick alert style + send test",
      done: Boolean(progress.alertsDone && progress.testAlertDone),
    },
  ];
}
