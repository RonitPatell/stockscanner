/** Market session labels for strategy conditions (ET). */

export type StrategyMarketSession =
  | "premarket"
  | "regular"
  | "afterhours"
  | "weekend"
  | "closed";

export function marketSessionAt(date: Date = new Date()): StrategyMarketSession {
  const et = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return "weekend";
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 240 && mins < 570) return "premarket";
  if (mins >= 570 && mins < 960) return "regular";
  if (mins >= 960 && mins < 1200) return "afterhours";
  return "closed";
}

export function sessionMatchesCondition(
  actual: string | null | undefined,
  expected: string
): boolean {
  if (!actual) return false;
  const a = actual.toLowerCase();
  const e = expected.toLowerCase();
  if (a === e) return true;
  // Treat weekend mute/filter as matching closed weekends
  if (e === "weekend" && (a === "weekend" || a === "closed")) return true;
  return false;
}
