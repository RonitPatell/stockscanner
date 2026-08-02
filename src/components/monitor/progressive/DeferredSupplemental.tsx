"use client";

import { Suspense, lazy, type ReactNode } from "react";
import { MonitorLoadBoundary } from "./MonitorLoadBoundary.ts";
import { SupplementalBlockSkeleton } from "./skeletons.ts";
import type { MonitorSelectedTicker } from "../selected-ticker/selected-ticker-types.ts";

const FilingsLazy = lazy(async () => {
  const m = await import("./SelectedTickerFilings.tsx");
  return { default: m.SelectedTickerFilings };
});

const AnaloguesLazy = lazy(async () => {
  const m = await import("./SelectedTickerAnalogues.tsx");
  return { default: m.SelectedTickerAnalogues };
});

const PersonalLazy = lazy(async () => {
  const m = await import("./SelectedTickerPersonal.tsx");
  return { default: m.SelectedTickerPersonal };
});

function CollapsedShell({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className="tt-intel__section tt-intel__section--secondary"
      data-intel-section={id}
      data-collapsed="true"
      data-open={open ? "true" : "false"}
    >
      <button
        type="button"
        className="tt-intel__collapse"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{title}</span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      <div className="tt-intel__collapse-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/** Filing excerpts — load after essential evidence primary source. */
export function DeferredFilingEvidence({
  dossier,
  hasFilingData,
}: {
  dossier: MonitorSelectedTicker;
  /** When snapshot already carried filings, skip skeleton for empty wait. */
  hasFilingData: boolean;
}) {
  return (
    <MonitorLoadBoundary
      id="filing-evidence"
      label="Filing evidence unavailable"
    >
      <Suspense
        fallback={
          hasFilingData ? (
            <SupplementalBlockSkeleton label="filings" rows={2} />
          ) : (
            <SupplementalBlockSkeleton label="filings" rows={1} />
          )
        }
      >
        <FilingsLazy dossier={dossier} />
      </Suspense>
    </MonitorLoadBoundary>
  );
}

export function DeferredAnaloguesSection({
  dossier,
  open,
  onToggle,
}: {
  dossier: MonitorSelectedTicker;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <CollapsedShell
      id="historical-analogues"
      title="Historical analogues"
      open={open}
      onToggle={onToggle}
    >
      {open ? (
        <MonitorLoadBoundary id="analogue" label="Analogues unavailable">
          <Suspense
            fallback={<SupplementalBlockSkeleton label="analogues" rows={1} />}
          >
            <AnaloguesLazy dossier={dossier} />
          </Suspense>
        </MonitorLoadBoundary>
      ) : null}
    </CollapsedShell>
  );
}

/**
 * When collapsed, keep a stable header only (no reopen/reorder).
 * Content mounts when the trader expands — isolated personal-data boundary.
 */
export function DeferredPersonalSection({
  dossier,
  section,
  title,
  open,
  onToggle,
}: {
  dossier: MonitorSelectedTicker;
  section:
    | "personal-feedback"
    | "autopsy"
    | "capital-risk-timeline"
    | "additional-market-statistics";
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <CollapsedShell id={section} title={title} open={open} onToggle={onToggle}>
      {open ? (
        <MonitorLoadBoundary
          id="personal-data"
          label={`${title} unavailable`}
        >
          <Suspense
            fallback={<SupplementalBlockSkeleton label={title} rows={2} />}
          >
            <PersonalLazy dossier={dossier} section={section} />
          </Suspense>
        </MonitorLoadBoundary>
      ) : null}
    </CollapsedShell>
  );
}
