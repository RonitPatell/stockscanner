/**
 * Fixture filing texts — structured like real EDGAR excerpts (not live fetches).
 * Used by dilution-radar-v2 tests.
 */

export const FIXTURE_S3_SHELF_ATM = {
  symbol: "ABCD",
  formType: "S-3",
  accessionNumber: "0001234567-24-000101",
  sourceUrl:
    "https://www.sec.gov/Archives/edgar/data/1234567/000123456724000101/s3.htm",
  title: "S-3 shelf registration — ABCD Inc.",
  body: `
FORM S-3 REGISTRATION STATEMENT
We may offer and sell from time to time up to an aggregate of $100,000,000 of our common stock.
We have entered into an at-the-market offering program with an agent under a sales agreement.
Shares outstanding: 25,000,000 shares of common stock outstanding as of the date hereof.
`,
  sharesOutstanding: 25_000_000,
};

export const FIXTURE_424B5_REGISTERED_DIRECT = {
  symbol: "WXYZ",
  formType: "424B5",
  accessionNumber: "0001234567-24-000202",
  sourceUrl:
    "https://www.sec.gov/Archives/edgar/data/1234567/000123456724000202/424b5.htm",
  title: "424B5 prospectus supplement — registered direct offering",
  body: `
PROSPECTUS SUPPLEMENT (to Prospectus dated January 15, 2024)
Registered Direct Offering
We are offering 5,000,000 shares of common stock at an offering price of $2.50 per share.
Aggregate offering price $12,500,000. Agreement to sell to institutional investors.
We also issued warrants to purchase 2,500,000 shares at an exercise price of $3.00.
`,
  sharesOutstanding: 40_000_000,
};

export const FIXTURE_ATM_AMENDMENT_TERMINATED = {
  symbol: "ABCD",
  formType: "S-3/A",
  accessionNumber: "0001234567-24-000303",
  sourceUrl:
    "https://www.sec.gov/Archives/edgar/data/1234567/000123456724000303/s3a.htm",
  title: "S-3/A amendment — ATM facility terminated",
  body: `
AMENDMENT NO. 1 TO FORM S-3
The Company has terminated the at-the-market facility and sales agreement with the agent.
No remaining capacity under the prior ATM program. Termination of the equity line.
`,
  sharesOutstanding: 25_000_000,
};

export const FIXTURE_CONVERTIBLE_NOTE = {
  symbol: "CONV",
  formType: "8-K",
  accessionNumber: "0001987654-24-000401",
  sourceUrl:
    "https://www.sec.gov/Archives/edgar/data/1987654/000198765424000401/ex.htm",
  title: "8-K — convertible senior notes",
  body: `
Item 1.01 Entry into a Material Definitive Agreement.
The Company issued $30,000,000 aggregate principal amount of convertible senior notes due 2029.
The notes are convertible into shares of common stock. Up to 8,000,000 shares may be issued upon conversion.
`,
  sharesOutstanding: 50_000_000,
};

export const FIXTURE_WARRANT_REPRICE = {
  symbol: "WRNT",
  formType: "8-K",
  accessionNumber: "0001111222-24-000501",
  title: "8-K — warrant reprice",
  body: `
The Company announced a warrant reprice. Outstanding warrants to purchase 4,000,000 shares
were repriced with a new exercise price of $1.25. Series A warrants exercisable.
`,
  sharesOutstanding: 20_000_000,
};

export const FIXTURE_REVERSE_SPLIT = {
  symbol: "RVSP",
  formType: "8-K",
  accessionNumber: "0001333444-24-000601",
  title: "8-K — reverse stock split",
  body: `
The Company effected a 1-for-10 reverse stock split of its common stock.
As adjusted shares outstanding now total 3,000,000 shares outstanding.
`,
  sharesOutstanding: 3_000_000,
};

export const FIXTURE_EFFECTIVE_REGISTRATION = {
  symbol: "EFCT",
  formType: "S-3",
  accessionNumber: "0001555666-24-000701",
  title: "S-3 — registration statement declared effective",
  body: `
The registration statement on Form S-3 was declared effective by the Securities and Exchange Commission.
Maximum aggregate offering price of $50,000,000. Currently effective shelf registration.
`,
  sharesOutstanding: 15_000_000,
};

export const FIXTURE_EQUITY_PURCHASE = {
  symbol: "EPUR",
  formType: "8-K",
  accessionNumber: "0001777888-24-000801",
  title: "8-K — equity purchase agreement",
  body: `
The Company entered into an equity purchase agreement with an investor to sell up to $25,000,000
of common stock from time to time. Maximum of 10,000,000 shares under the purchase agreement.
`,
  sharesOutstanding: 30_000_000,
};

export const FIXTURE_CONFLICTING_ATM_CAPACITY = {
  symbol: "CONF",
  formType: "424B5",
  accessionNumber: "0001999000-24-000901",
  title: "424B5 — ATM prospectus supplement",
  body: `
Prospectus supplement for at-the-market offering program.
We may sell up to an aggregate of $75,000,000 of common stock under the ATM sales agreement.
`,
  sharesOutstanding: 22_000_000,
};

export const FIXTURE_ATM_PRIOR_SMALLER = {
  symbol: "CONF",
  formType: "S-3",
  accessionNumber: "0001999000-24-000850",
  title: "S-3 — prior ATM program",
  body: `
Shelf registration establishing an at-the-market offering facility.
Aggregate offering price of up to $20,000,000 under the sales agreement.
`,
  sharesOutstanding: 22_000_000,
};

/** Dollars-only shelf with no share count and no reliable denom → no dilution % */
export const FIXTURE_CAPACITY_ONLY_NO_SHARES = {
  symbol: "CAPX",
  formType: "S-3",
  accessionNumber: "0001000001-24-001001",
  title: "S-3 shelf — dollar capacity only",
  body: `
FORM S-3. We may offer and sell securities with a maximum aggregate offering price of $200,000,000.
Shelf registration statement. No specific share amount is set forth.
`,
  sharesOutstanding: null as number | null,
};
