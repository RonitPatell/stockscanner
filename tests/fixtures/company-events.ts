/**
 * Fixture disclosures for Company Event Engine tests (no live SEC fetches).
 */

export const FIXTURE_8K_AUDITOR = {
  symbol: "AUDT",
  formType: "8-K",
  accessionNumber: "0001111000-24-000801",
  sourceUrl:
    "https://www.sec.gov/Archives/edgar/data/1111000/000111100024000801/ex.htm",
  title: "8-K Filing: Item 4.01 Changes in Registrant's Certifying Accountant",
  summary: "Material event disclosure (Form 8-K)",
  body: `
UNITED STATES SECURITIES AND EXCHANGE COMMISSION
FORM 8-K
Item 4.01 Changes in Registrant's Certifying Accountant.
On March 1, 2024, the Company dismissed its independent registered public accounting firm.
`,
  rawNewsId: "sec-8-k-0001111000-2024-03-01T12:00:00Z",
  publishedAt: new Date("2024-03-01T12:00:00.000Z"),
};

export const FIXTURE_8K_RESULTS = {
  symbol: "EARN",
  formType: "8-K",
  accessionNumber: "0001222000-24-000802",
  title: "8-K Filing: Results of Operations",
  body: `
Item 2.02 Results of Operations and Financial Condition.
The Company issued a press release announcing earnings release for the quarter.
`,
  rawNewsId: "sec-8-k-0001222000-2024-03-02T12:00:00Z",
  publishedAt: new Date("2024-03-02T12:00:00.000Z"),
};

export const FIXTURE_8K_GENERIC = {
  symbol: "GENR",
  formType: "8-K",
  accessionNumber: "0001333000-24-000803",
  title: "8-K Filing: Other Events",
  body: `
FORM 8-K
The Company furnished certain information under Item 8.01 Other Events.
No Item 4.01 or Item 5.02 disclosure in this filing.
`,
  rawNewsId: "sec-8-k-0001333000-2024-03-03T12:00:00Z",
  publishedAt: new Date("2024-03-03T12:00:00.000Z"),
};

export const FIXTURE_FORM4 = {
  symbol: "INSD",
  formType: "4",
  accessionNumber: "0001444000-24-000804",
  title: "Form 4 (insider): Officer transaction",
  summary: "Insider transaction (Form 4)",
  rawNewsId: "sec-4-0001444000-2024-03-04T12:00:00Z",
  publishedAt: new Date("2024-03-04T12:00:00.000Z"),
};

export const FIXTURE_13D = {
  symbol: "OWNR",
  formType: "SC 13D",
  accessionNumber: "0001555000-24-000805",
  title: "Schedule 13D: Beneficial ownership",
  rawNewsId: "sec-sc-13d-0001555000-2024-03-05T12:00:00Z",
  publishedAt: new Date("2024-03-05T12:00:00.000Z"),
};

export const FIXTURE_NT_10Q = {
  symbol: "LATE",
  formType: "NT 10-Q",
  accessionNumber: "0001666000-24-000806",
  title: "NT 10-Q (late quarterly): Notification of Late Filing",
  rawNewsId: "sec-nt-10-q-0001666000-2024-03-06T12:00:00Z",
  publishedAt: new Date("2024-03-06T12:00:00.000Z"),
};

export const FIXTURE_10K = {
  symbol: "ANNL",
  formType: "10-K",
  accessionNumber: "0001777000-24-000807",
  title: "10-K Filing: Annual Report",
  rawNewsId: "sec-10-k-0001777000-2024-03-07T12:00:00Z",
  publishedAt: new Date("2024-03-07T12:00:00.000Z"),
};
