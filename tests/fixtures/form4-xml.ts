/**
 * Synthetic Form 4 ownershipDocument XML fixtures (no live SEC).
 */

/** CEO open-market sale with price + direct holdings + 10b5-1 footnote */
export const FIXTURE_FORM4_OPEN_MARKET_SALE = `<?xml version="1.0"?>
<ownershipDocument>
  <schemaVersion>X0508</schemaVersion>
  <documentType>4</documentType>
  <periodOfReport>2024-06-15</periodOfReport>
  <issuer>
    <issuerCik>0001444000</issuerCik>
    <issuerName>Example Biotech Inc</issuerName>
    <issuerTradingSymbol>INSD</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001999001</rptOwnerCik>
      <rptOwnerName>Jane Founder</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>1</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
      <isOther>0</isOther>
      <officerTitle>Chief Executive Officer</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2024-06-15</value></transactionDate>
      <transactionCoding>
        <transactionFormType>4</transactionFormType>
        <transactionCode>S</transactionCode>
        <equitySwapInvolved>0</equitySwapInvolved>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>25000</value></transactionShares>
        <transactionPricePerShare><value>12.50</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>175000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
  <footnotes>
    <footnote id="F1">Shares sold pursuant to a Rule 10b5-1 trading plan adopted on January 2, 2024.</footnote>
  </footnotes>
  <remarks></remarks>
</ownershipDocument>`;

/** Open-market purchase */
export const FIXTURE_FORM4_OPEN_MARKET_PURCHASE = `<?xml version="1.0"?>
<ownershipDocument>
  <documentType>4</documentType>
  <issuer>
    <issuerCik>0001555000</issuerCik>
    <issuerName>Buy Co</issuerName>
    <issuerTradingSymbol>BUYY</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001888001</rptOwnerCik>
      <rptOwnerName>Alex Buyer</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>0</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2024-07-01</value></transactionDate>
      <transactionCoding>
        <transactionCode>P</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>5000</value></transactionShares>
        <transactionPricePerShare><value>3.25</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>45000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

/** RSU / grant award — not a sale */
export const FIXTURE_FORM4_GRANT = `<?xml version="1.0"?>
<ownershipDocument>
  <documentType>4</documentType>
  <issuer>
    <issuerCik>0001666000</issuerCik>
    <issuerName>Grant Co</issuerName>
    <issuerTradingSymbol>GRNT</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerName>Pat Officer</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isOfficer>1</isOfficer>
      <officerTitle>CFO</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2024-05-01</value></transactionDate>
      <transactionCoding>
        <transactionCode>A</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>10000</value></transactionShares>
        <transactionPricePerShare><value>0</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>60000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

/** Tax withholding (code F) — disposition but NOT open-market sale */
export const FIXTURE_FORM4_TAX_WITHHOLDING = `<?xml version="1.0"?>
<ownershipDocument>
  <documentType>4</documentType>
  <issuer>
    <issuerCik>0001777000</issuerCik>
    <issuerName>Tax Co</issuerName>
    <issuerTradingSymbol>TAXX</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerName>Sam Holder</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isOfficer>1</isOfficer>
      <officerTitle>VP Engineering</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2024-04-10</value></transactionDate>
      <transactionCoding>
        <transactionCode>F</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1200</value></transactionShares>
        <transactionPricePerShare><value>8.10</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>18800</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

/** Option exercise (code M) */
export const FIXTURE_FORM4_OPTION_EXERCISE = `<?xml version="1.0"?>
<ownershipDocument>
  <documentType>4</documentType>
  <issuer>
    <issuerCik>0001888000</issuerCik>
    <issuerName>Opt Co</issuerName>
    <issuerTradingSymbol>OPTX</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerName>Chris Exerciser</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2024-03-20</value></transactionDate>
      <transactionCoding>
        <transactionCode>M</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>8000</value></transactionShares>
        <transactionPricePerShare><value>2.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>28000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

/** Gift (code G) */
export const FIXTURE_FORM4_GIFT = `<?xml version="1.0"?>
<ownershipDocument>
  <documentType>4</documentType>
  <issuer>
    <issuerCik>0001999000</issuerCik>
    <issuerName>Gift Co</issuerName>
    <issuerTradingSymbol>GIFT</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerName>Dana Giver</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isTenPercentOwner>1</isTenPercentOwner>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2024-02-14</value></transactionDate>
      <transactionCoding>
        <transactionCode>G</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>2000</value></transactionShares>
        <transactionPricePerShare><value>0</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>998000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

/** Affirmative trading arrangement flag on transaction */
export const FIXTURE_FORM4_AFFIRMATIVE_10B51 = `<?xml version="1.0"?>
<ownershipDocument>
  <documentType>4</documentType>
  <issuer>
    <issuerCik>0001222000</issuerCik>
    <issuerName>Plan Co</issuerName>
    <issuerTradingSymbol>PLAN</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerName>Riley Plan</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isOfficer>1</isOfficer>
      <officerTitle>President</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2024-08-01</value></transactionDate>
      <transactionCoding>
        <transactionCode>S</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>20</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <affirmativeTradingArrangement>true</affirmativeTradingArrangement>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>9000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;
