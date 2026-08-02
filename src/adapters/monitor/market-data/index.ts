export { FakeMarketDataProvider } from "./fake-provider.ts";
export { toNormalizedTrade } from "./finnhub-trade-adapter.ts";
export type { FinnhubTradeMessage } from "./finnhub-trade-adapter.ts";
export { yahooSnapshotToAggregate1s } from "./yahoo-aggregate-adapter.ts";
export type { YahooPollSnapshot } from "./yahoo-aggregate-adapter.ts";
export {
  finnhubCredentialRef,
  polygonCredentialRef,
  readServerSecret,
} from "./credentials.ts";
