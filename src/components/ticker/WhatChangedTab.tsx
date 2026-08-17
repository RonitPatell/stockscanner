import { WhatChangedFeedClient } from "./WhatChangedFeedClient";
import type { CompanyWhatChangedFeed } from "@/lib/ticker-what-changed/types";

/**
 * Server wrapper — passes public/entitled initial feed.
 * Thesis fields are never present when accessMode is public.
 */
export function WhatChangedTab({
  symbol,
  feed,
  entitled,
}: {
  symbol: string;
  feed: CompanyWhatChangedFeed;
  entitled: boolean;
}) {
  return (
    <WhatChangedFeedClient
      symbol={symbol}
      initialFeed={feed}
      entitled={entitled}
    />
  );
}
