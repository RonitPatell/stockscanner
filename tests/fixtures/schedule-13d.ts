/**
 * Synthetic Schedule 13D/13G cover-page fixtures (no live SEC).
 */

export const FIXTURE_13D_INITIAL_HTML = `
<html><body>
<h1>SCHEDULE 13D</h1>
<p>CUSIP No. 123456789</p>
<p>1. Names of Reporting Persons</p>
<p>Alpha Capital Partners LLC</p>
<p>2. Check the Appropriate Box...</p>
<p>Name of Issuer</p>
<p>Ownr Corp</p>
<p>Title of Class of Securities</p>
<p>Common Stock</p>
<p>Trading Symbol</p>
<p>OWNR</p>
<p>11. Aggregate Amount Beneficially Owned by Each Reporting Person</p>
<p>12,500,000</p>
<p>13. Percent of Class Represented by Amount in Row (11)</p>
<p>9.8%</p>
</body></html>
`;

export const FIXTURE_13D_AMENDMENT_REDUCTION = `
<html><body>
SCHEDULE 13D/A
Name of Reporting Person
Alpha Capital Partners LLC
Name of Issuer
Ownr Corp
Aggregate Amount Beneficially Owned by Each Reporting Person
3,000,000
Percent of Class Represented by Amount in Row (11)
2.1%
</body></html>
`;

export const FIXTURE_13G_INITIAL = `
SCHEDULE 13G
Names of Reporting Persons
Beta Index Fund
Name of Issuer
Quiet Inc
Aggregate Amount Beneficially Owned by Each Reporting Person
8,000,000
Percent of Class Represented by Amount in Row (11)
6.2%
`;

export const FIXTURE_13G_AMENDMENT_INCREASE = `
SCHEDULE 13G/A
Name of Reporting Person
Beta Index Fund
Name of Issuer
Quiet Inc
Aggregate Amount Beneficially Owned by Each Reporting Person
11,000,000
Percent of Class Represented by Amount in Row (11)
8.5%
`;

/** Gibberish / no cover fields — must stay unparseable */
export const FIXTURE_13D_UNPARSEABLE = `
<html><body>
<p>This filing contains exhibits only.</p>
<p>See attached for details.</p>
</body></html>
`;

export const FIXTURE_13D_SHARES_ONLY = `
SCHEDULE 13D
Names of Reporting Persons
Mystery Holder LP
Name of Issuer
Sparse Co
Aggregate Amount Beneficially Owned by Each Reporting Person
1,500,000
`;
