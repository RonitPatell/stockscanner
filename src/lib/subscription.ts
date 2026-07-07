export function hasActiveSubscription(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}
