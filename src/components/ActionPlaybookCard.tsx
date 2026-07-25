"use client";

import { useMemo } from "react";
import type { CatalystItem } from "@/types";
import { TradeJudgmentPanel } from "./TradeJudgmentPanel";

/** @deprecated Prefer TradeJudgmentPanel — kept for older imports */
export function ActionPlaybookCard({
  catalyst,
  className,
}: {
  catalyst: CatalystItem;
  className?: string;
  compact?: boolean;
}) {
  const key = useMemo(
    () =>
      `${catalyst.id}-${catalyst.changePercent}-${catalyst.rVol}-${catalyst.sentimentScore}`,
    [catalyst]
  );
  return <TradeJudgmentPanel key={key} catalyst={catalyst} className={className} />;
}
