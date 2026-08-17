/**
 * Structured Form 4 / insider intelligence unit tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyForm4Transaction,
  computeHoldingChange,
  computeTransactionValue,
} from "../src/lib/insider/classify.ts";
import { parseForm4Xml } from "../src/lib/insider/parse.ts";
import { buildInsiderSummary } from "../src/lib/insider/summary.ts";
import { clusterFromRows } from "../src/lib/insider/cluster.ts";
import { mapInsiderTransactionsToEvents } from "../src/lib/insider/events.ts";
import { shouldExtractForm4 } from "../src/lib/insider/from-catalyst.ts";
import { isCompanyEventType } from "../src/lib/company-events/types.ts";
import { scoreEventSignificance } from "../src/lib/company-events/significance.ts";
import {
  FIXTURE_FORM4_AFFIRMATIVE_10B51,
  FIXTURE_FORM4_GIFT,
  FIXTURE_FORM4_GRANT,
  FIXTURE_FORM4_OPEN_MARKET_PURCHASE,
  FIXTURE_FORM4_OPEN_MARKET_SALE,
  FIXTURE_FORM4_OPTION_EXERCISE,
  FIXTURE_FORM4_TAX_WITHHOLDING,
} from "./fixtures/form4-xml.ts";

test("open-market sale parses CEO shares, price, value, holdings, 10b5-1", () => {
  const r = parseForm4Xml(FIXTURE_FORM4_OPEN_MARKET_SALE, {
    accessionNumber: "0001444000-24-000804",
  });
  assert.equal(r.transactions.length, 1);
  const tx = r.transactions[0]!;
  assert.equal(tx.ownerName, "Jane Founder");
  assert.equal(tx.officerTitle, "Chief Executive Officer");
  assert.equal(tx.issuerName, "Example Biotech Inc");
  assert.equal(tx.tradingSymbol, "INSD");
  assert.equal(tx.transactionCode, "S");
  assert.equal(tx.acquiredDisposed, "D");
  assert.equal(tx.shares, 25000);
  assert.equal(tx.pricePerShare, 12.5);
  assert.equal(tx.transactionValue, 25000 * 12.5);
  assert.equal(tx.sharesOwnedAfter, 175000);
  assert.equal(tx.isDirect, true);
  assert.equal(tx.holdingChange, -25000);
  assert.equal(tx.classification, "open_market_sale");
  assert.equal(tx.is10b51, true);
  assert.match(tx.summaryText, /sold 25,000 shares/i);
  assert.match(tx.summaryText, /\$12\.50/);
  assert.doesNotMatch(tx.summaryText, /will sell|bearish|alpha/i);
});

test("open-market purchase classified distinctly", () => {
  const tx = parseForm4Xml(FIXTURE_FORM4_OPEN_MARKET_PURCHASE).transactions[0]!;
  assert.equal(tx.classification, "open_market_purchase");
  assert.equal(tx.transactionCode, "P");
  assert.equal(tx.holdingChange, 5000);
  assert.match(tx.summaryText, /purchased 5,000 shares/i);
});

test("grant/award is not an open-market sale", () => {
  const tx = parseForm4Xml(FIXTURE_FORM4_GRANT).transactions[0]!;
  assert.equal(tx.classification, "grant_award");
  assert.notEqual(tx.classification, "open_market_sale");
  assert.match(tx.summaryText, /grant/i);
});

test("tax withholding disposition is not open-market sale", () => {
  const tx = parseForm4Xml(FIXTURE_FORM4_TAX_WITHHOLDING).transactions[0]!;
  assert.equal(tx.classification, "tax_withholding");
  assert.equal(tx.acquiredDisposed, "D");
  assert.notEqual(tx.classification, "open_market_sale");
  assert.match(tx.summaryText, /tax withholding/i);
  assert.match(tx.summaryText, /not an open-market sale/i);
});

test("option exercise classified", () => {
  const tx = parseForm4Xml(FIXTURE_FORM4_OPTION_EXERCISE).transactions[0]!;
  assert.equal(tx.classification, "option_exercise");
  assert.equal(tx.transactionCode, "M");
});

test("gift classified", () => {
  const tx = parseForm4Xml(FIXTURE_FORM4_GIFT).transactions[0]!;
  assert.equal(tx.classification, "gift");
  assert.equal(tx.isTenPercent, true);
});

test("affirmativeTradingArrangement sets 10b5-1", () => {
  const tx = parseForm4Xml(FIXTURE_FORM4_AFFIRMATIVE_10B51).transactions[0]!;
  assert.equal(tx.is10b51, true);
  assert.equal(tx.classification, "open_market_sale");
});

test("code D (issuer disposition) is other, not open-market sale", () => {
  assert.equal(
    classifyForm4Transaction({ transactionCode: "D", acquiredDisposed: "D" }),
    "other"
  );
  assert.equal(
    classifyForm4Transaction({ transactionCode: "S", acquiredDisposed: "D" }),
    "open_market_sale"
  );
});

test("holding change requires direct + A/D compatibility", () => {
  assert.equal(
    computeHoldingChange({
      shares: 100,
      acquiredDisposed: "D",
      isDirect: true,
      sharesOwnedAfter: 400,
    }),
    -100
  );
  assert.equal(
    computeHoldingChange({
      shares: 100,
      acquiredDisposed: "D",
      isDirect: false,
      sharesOwnedAfter: 400,
    }),
    null
  );
  assert.equal(
    computeHoldingChange({
      shares: 100,
      acquiredDisposed: "A",
      isDirect: true,
      sharesOwnedAfter: 50,
    }),
    null
  );
  assert.equal(computeTransactionValue(10, 2.5), 25);
  assert.equal(computeTransactionValue(null, 2.5), null);
});

test("summaries never imply predictive alpha", () => {
  const tx = parseForm4Xml(FIXTURE_FORM4_OPEN_MARKET_SALE).transactions[0]!;
  const s = buildInsiderSummary(tx);
  assert.doesNotMatch(s, /buy signal|sell signal|alpha|bearish|bullish|will dilute/i);
});

test("maps open-market sale → insider_sale CompanyEvent", () => {
  const parsed = parseForm4Xml(FIXTURE_FORM4_OPEN_MARKET_SALE);
  const events = mapInsiderTransactionsToEvents({
    symbol: "INSD",
    accessionNumber: "0001444000-24-000804",
    filedAt: new Date("2024-06-16"),
    transactions: parsed.transactions,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.eventType, "insider_sale");
  assert.equal(events[0]!.category, "insider");
  assert.ok(isCompanyEventType(events[0]!.eventType));
  assert.match(events[0]!.summary ?? "", /not a trading signal/i);
});

test("tax withholding maps to insider_disposition_other not insider_sale", () => {
  const parsed = parseForm4Xml(FIXTURE_FORM4_TAX_WITHHOLDING);
  const events = mapInsiderTransactionsToEvents({
    symbol: "TAXX",
    accessionNumber: "0001777000-24-000001",
    filedAt: new Date("2024-04-11"),
    transactions: parsed.transactions,
  });
  assert.equal(events[0]!.eventType, "insider_disposition_other");
});

test("cluster detection for multiple purchases", () => {
  const clusters = clusterFromRows("CLUS", [
    {
      classification: "open_market_purchase",
      ownerName: "A",
      at: new Date("2024-06-01"),
    },
    {
      classification: "open_market_purchase",
      ownerName: "B",
      at: new Date("2024-06-03"),
    },
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]!.kind, "purchases");
  assert.equal(clusters[0]!.count, 2);
  assert.match(clusters[0]!.summary, /not a trading signal|not a buy signal/i);
});

test("cluster detection for multiple sales", () => {
  const clusters = clusterFromRows("CLUS", [
    {
      classification: "open_market_sale",
      ownerName: "A",
      at: new Date("2024-06-01"),
    },
    {
      classification: "open_market_sale",
      ownerName: "A",
      at: new Date("2024-06-02"),
    },
  ]);
  assert.equal(clusters[0]!.kind, "sales");
  assert.doesNotMatch(clusters[0]!.summary, /\balpha\b/i);
});

test("grants alone do not form a sale cluster", () => {
  const clusters = clusterFromRows("CLUS", [
    { classification: "grant_award", ownerName: "A", at: new Date("2024-06-01") },
    { classification: "grant_award", ownerName: "B", at: new Date("2024-06-02") },
    {
      classification: "tax_withholding",
      ownerName: "C",
      at: new Date("2024-06-03"),
    },
  ]);
  assert.equal(clusters.length, 0);
});

test("shouldExtractForm4 gates on sec-4 raw id", () => {
  assert.equal(
    shouldExtractForm4({
      source: "SEC EDGAR",
      rawNewsId: "sec-4-0001444000-2024-06-16T12:00:00Z",
      headline: "Form 4 (insider): Officer transaction",
    }),
    true
  );
  assert.equal(
    shouldExtractForm4({
      source: "SEC EDGAR",
      rawNewsId: "sec-8-k-0001",
      headline: "8-K Filing",
    }),
    false
  );
});

test("significance: insider_sale MEDIUM; cluster INFORMATIONAL", () => {
  const sale = scoreEventSignificance({
    eventType: "insider_sale",
    category: "insider",
    title: "Open-market sale",
    summary: "CEO sold shares",
  });
  assert.equal(sale.level, "MEDIUM");
  assert.ok(sale.reasonCodes.includes("INSIDER_OPEN_MARKET_SALE"));

  const cluster = scoreEventSignificance({
    eventType: "insider_cluster_purchases",
    category: "insider",
    title: "Insider purchase cluster",
    summary: "cluster",
  });
  assert.equal(cluster.level, "INFORMATIONAL");
  assert.ok(cluster.reasonCodes.includes("INSIDER_CLUSTER"));
});

test("empty xml yields warnings and no invented transactions", () => {
  const r = parseForm4Xml("");
  assert.equal(r.transactions.length, 0);
  assert.ok(r.parseWarnings.includes("empty_xml"));
});
