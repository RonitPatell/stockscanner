/**
 * Placeholder panels for ticker tabs that are not fully built yet.
 */

export function TickerPlaceholderTab({
  title,
  body,
  testId,
}: {
  title: string;
  body: string;
  testId: string;
}) {
  return (
    <section
      className="rounded-xl border border-dashed border-zinc-700 px-4 py-10 text-center space-y-2"
      data-testid={testId}
    >
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      <p className="text-[13px] text-zinc-500 max-w-md mx-auto leading-relaxed">
        {body}
      </p>
    </section>
  );
}
