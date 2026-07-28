/**
 * E2E workflow harness gate — never enable on production Vercel.
 * Available in local development, or when ALLOW_E2E_HARNESS=1.
 */
export function isE2eWorkflowHarnessAllowed(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) return false;
  return (
    process.env.ALLOW_E2E_HARNESS === "1" ||
    process.env.NODE_ENV === "development"
  );
}
