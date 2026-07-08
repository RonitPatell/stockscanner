"use client";

const TICKERS = [
  { sym: "NVDA", chg: "+4.2%", up: true },
  { sym: "MRNA", chg: "+11.8%", up: true },
  { sym: "TSLA", chg: "-2.1%", up: false },
  { sym: "AMD", chg: "+6.4%", up: true },
  { sym: "PLTR", chg: "+3.7%", up: true },
  { sym: "SOFI", chg: "+8.9%", up: true },
  { sym: "COIN", chg: "-1.4%", up: false },
  { sym: "RIVN", chg: "+14.2%", up: true },
  { sym: "SMCI", chg: "+5.1%", up: true },
  { sym: "META", chg: "+2.3%", up: true },
];

export function TickerMarquee() {
  const row = [...TICKERS, ...TICKERS];

  return (
    <div className="relative border-y border-zinc-800/80 bg-zinc-950/60 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-zinc-950 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-zinc-950 to-transparent z-10 pointer-events-none" />
      <div className="flex animate-marquee whitespace-nowrap py-3">
        {row.map((t, i) => (
          <span key={`${t.sym}-${i}`} className="inline-flex items-center gap-2 mx-6 text-sm">
            <span className="font-mono font-bold text-zinc-200">{t.sym}</span>
            <span className={t.up ? "text-emerald-400 font-mono" : "text-red-400 font-mono"}>
              {t.chg}
            </span>
            <span className="text-zinc-700">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
