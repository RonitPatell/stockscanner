export function DisclaimerBanner({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-[10px] text-zinc-600 text-center">
        Not investment advice. For informational purposes only. Past performance does not guarantee future results.
      </p>
    );
  }

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3 text-xs text-amber-200/80">
      <strong className="text-amber-400">Disclaimer:</strong> TrustTicker provides informational market data and automated sentiment analysis only. 
      This is not investment advice, financial advice, trading advice, or a recommendation to buy or sell any security. 
      Always do your own research and consult a licensed financial advisor. Past performance of historically similar catalysts does not guarantee future results.
    </div>
  );
}
