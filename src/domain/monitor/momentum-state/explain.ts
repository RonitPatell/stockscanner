import type { MomentumLifecycleState, TransitionEvidence } from "./types.ts";

const PLAIN: Record<MomentumLifecycleState, string> = {
  DORMANT:
    "Activity is quiet — intensity and participation are low. This is an activity label only.",
  EMERGING:
    "Activity is beginning to rise from a quiet baseline. Inspection interest is increasing; not a trade cue.",
  BUILDING:
    "Participation and intensity are building in a sustained way. Describes market activity structure only.",
  BREAKING:
    "Intensity and participation are breaking higher with directional acceleration. Activity characterization only — not an entry recommendation.",
  ACTIVE:
    "Elevated activity is established and ongoing. Describes current tape engagement, not trade attractiveness.",
  COOLING:
    "Intensity slope has turned down from a more active phase. Cooling is an activity phase label only.",
  FADING:
    "Activity is fading toward quiet. Descriptive of participation decay only.",
  RECLAIMING:
    "After cooling, intensity and participation are attempting to reclaim. Activity path label only — not a trade cue.",
  HALTED:
    "Trading is halted for this symbol. Halt overrides all other momentum lifecycle states.",
  UNKNOWN:
    "Critical inputs are missing or stale, so the lifecycle state cannot be classified reliably.",
};

export function explainState(
  state: MomentumLifecycleState,
  evidence: TransitionEvidence[]
): string {
  const top = evidence
    .filter(
      (e) =>
        e.code.startsWith("propose_") ||
        e.code === "override_halt" ||
        e.code === "override_stale" ||
        e.code === "override_post_halt"
    )
    .slice(-2)
    .map((e) => e.detail)
    .join("; ");
  const base = PLAIN[state];
  return top ? `${base} Evidence: ${top}.` : base;
}
