# Three-year retention audit

Does TrustTicker become more valuable after Day 1, Month 3, Year 1, Year 3?

Day 1: identity + first hydration + thesis start.
Month 3: evaluations, Watchtower relevance, brief cutoffs.
Year 1–3: observation history, snapshot trail, revision log.

## Can the investor answer…

| Question | Grade | Evidence |
|---|---|---|
| 1. Why did I originally care about this company? | PASS | Thesis note + `createdAt`. Revisions keep later edits from erasing the first version. |
| 2. What assumptions did I set? | PASS | `ThesisCondition` rows + revision log on create/update. |
| 3. Which assumptions failed? | PASS | `ThesisEvaluation.resultsJson` PASS/WARN/FAIL per condition. |
| 4. When did they fail? | PASS | `ThesisEvaluation.evaluatedAt`. |
| 5. What changed in the business since I started monitoring? | PASS | `MetricObservation` history + Quarterly Delta + Capital snapshots. |
| 6. What major events did TrustTicker surface? | PASS | Shared `CompanyEvent` + Watchtower. |
| 7. What did I review or dismiss? | PASS | `UserCompanyEventState` read/dismiss. |
| 8. How has my thesis changed? | PASS | `ThesisRevision` + evaluation trail; threshold edits do not rewrite old evals. |

## Accumulated state

Monitored companies (`PortfolioItem`), thesis, condition history, historical evaluations, CompanyEvents, financial history, capital-risk snapshots, reviewed events, alert preferences, brief cutoff (`lastBriefSeenAt`), company change history (events + metrics).

No social feed, AI picks, or generic charting was added.
