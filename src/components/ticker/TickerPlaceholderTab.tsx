/**
 * Placeholder panels for ticker tabs that are unavailable or failed to load.
 */

export function TickerPlaceholderTab({
  title,
  body,
  testId,
  onRetry,
}: {
  title: string;
  body: string;
  testId: string;
  onRetry?: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-dashed border-zinc-700 px-4 py-10 text-center space-y-3"
      data-testid={testId}
      role={onRetry ? "alert" : undefined}
    >
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      <p className="text-[13px] text-zinc-500 max-w-md mx-auto leading-relaxed">
        {body}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center rounded-md border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-200 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          data-testid={`${testId}-retry`}
        >
          Retry
        </button>
      ) : null}
    </section>
  );
}
