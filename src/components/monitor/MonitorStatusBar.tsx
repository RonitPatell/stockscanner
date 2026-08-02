"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BrandHomeLink } from "@/components/BrandHomeLink";
import { UserMenu } from "@/components/UserMenu";
import type { MonitorConnectionState } from "./monitor-types";
import { MonitorSquawkBar, type MonitorSquawkBarProps } from "./MonitorSquawkBar";
import { MonitorPresetPanel, type MonitorPresetPanelProps } from "./MonitorPresetPanel";
import { useConnectionChrome } from "./motion/useConnectionChrome.ts";

function Popover({
  label,
  testId,
  guide,
  tone,
  children,
  align = "start",
}: {
  label: ReactNode;
  testId?: string;
  guide?: string;
  tone?: string;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="tt-monitor__popover" ref={rootRef} data-align={align}>
      <button
        type="button"
        className="tt-monitor__pill tt-monitor__popover-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={testId}
        data-guide={guide}
        data-tone={tone}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open ? (
        <div
          id={panelId}
          className="tt-monitor__popover-panel"
          role="dialog"
          data-testid={testId ? `${testId}-panel` : undefined}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export interface MonitorStatusBarProps {
  sessionLabel: string;
  connection: MonitorConnectionState;
  lastEventAgeLabel: string;
  /** Snapshot age for first-paint desk (distinct from last stream event). */
  snapshotAgeLabel?: string | null;
  providerNotes: string[];
  search: string;
  onSearchChange: (v: string) => void;
  preset: MonitorPresetPanelProps;
  squawk: MonitorSquawkBarProps | null;
  squawkFireCount?: number;
  /** Squawk is actively speaking — status-bar indicator. */
  squawkSpeaking?: boolean;
  demoConnection?: {
    value: MonitorConnectionState;
    onChange: (c: MonitorConnectionState) => void;
  };
  onToggleLadder?: () => void;
  onToggleIntel?: () => void;
  ladderOpen?: boolean;
}

/**
 * Command-centre top bar — mark, session, connection, age, search, preset, squawk, profile.
 * Infrastructure detail lives in the connection popover.
 */
export function MonitorStatusBar({
  sessionLabel,
  connection,
  lastEventAgeLabel,
  snapshotAgeLabel = null,
  providerNotes,
  search,
  onSearchChange,
  preset,
  squawk,
  squawkFireCount = 0,
  squawkSpeaking = false,
  demoConnection,
  onToggleLadder,
  onToggleIntel,
  ladderOpen,
}: MonitorStatusBarProps) {
  const traderNotes = providerNotes.filter(
    (n) => !/SSR|POSTGRES|REDIS|generatedAt|lastEventId/i.test(n)
  );
  const conn = useConnectionChrome(connection, traderNotes);
  const activePreset =
    preset.strategy?.name?.trim() ||
    preset.strategy?.presetId ||
    "None";

  return (
    <div
      className="tt-monitor__status"
      data-guide="monitor-status-bar"
      data-testid="monitor-status-bar"
    >
      <BrandHomeLink
        className="tt-monitor__mark"
        showText={false}
        iconClassName="w-7 h-7"
      />
      <span className="tt-monitor__brand-text">TrustTicker</span>

      <span className="tt-monitor__pill" data-guide="monitor-session">
        {sessionLabel}
      </span>

      <Popover
        testId="monitor-connection"
        guide="monitor-connection"
        tone={conn.tone}
        label={
          <span
            className="tt-monitor__conn"
            data-state={conn.chrome}
            data-steady={conn.steady ? "true" : "false"}
          >
            <span className="tt-monitor__conn-dot" aria-hidden />
            {conn.label}
          </span>
        }
      >
        <p className="tt-monitor__popover-title">Connection detail</p>
        <p className="tt-monitor__popover-body">
          Stream state: <strong>{conn.label}</strong>
        </p>
        <p className="tt-monitor__popover-body">{conn.reason}</p>
        <p className="tt-monitor__popover-body">
          Last market event: {lastEventAgeLabel}
        </p>
        {traderNotes.length > 0 ? (
          <ul className="tt-monitor__popover-list">
            {traderNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <p className="tt-monitor__popover-muted">
            No provider notes. Worker cycles and raw infra stay off the main bar.
          </p>
        )}
      </Popover>

      <span className="tt-monitor__pill tt-num" data-testid="monitor-last-event-age">
        Event · {lastEventAgeLabel}
      </span>
      {snapshotAgeLabel ? (
        <span
          className="tt-monitor__pill tt-num"
          data-testid="monitor-snapshot-age"
          title="Age of the server Monitor snapshot used for first paint"
        >
          Snapshot · {snapshotAgeLabel}
        </span>
      ) : null}

      <input
        className="tt-monitor__search"
        data-guide="monitor-search"
        data-testid="monitor-search"
        placeholder="Search symbol"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="Search Monitor"
      />

      <Popover
        testId="monitor-active-preset"
        guide="monitor-preset"
        label={`Preset · ${activePreset}`}
      >
        <MonitorPresetPanel {...preset} />
      </Popover>

      {squawk ? (
        <Popover
          testId="monitor-squawk-menu"
          guide="monitor-squawk"
          label={
            <span
              className="tt-monitor__squawk-label"
              data-speaking={squawkSpeaking ? "true" : "false"}
            >
              <span className="tt-monitor__squawk-dot" aria-hidden />
              Squawk
            </span>
          }
          align="end"
        >
          <MonitorSquawkBar {...squawk} compact speaking={squawkSpeaking} />
        </Popover>
      ) : null}

      <span className="sr-only" data-testid="monitor-squawk-fire-count" aria-live="polite">
        {squawkFireCount}
      </span>

      {demoConnection && process.env.NODE_ENV === "development" ? (
        <select
          aria-label="Demo connection state"
          className="tt-monitor__pill bg-transparent"
          value={demoConnection.value}
          onChange={(e) =>
            demoConnection.onChange(e.target.value as MonitorConnectionState)
          }
        >
          {(
            [
              "live",
              "degraded",
              "disconnected",
              "delayed",
              "partial_outage",
              "loading",
              "empty",
              "error",
            ] as MonitorConnectionState[]
          ).map((c) => (
            <option key={c} value={c}>
              demo:{c}
            </option>
          ))}
        </select>
      ) : null}

      <div className="tt-monitor__status-end">
        {onToggleLadder ? (
          <button
            type="button"
            className="tt-monitor__collapse-btn tt-monitor__tablet-only"
            onClick={onToggleLadder}
            data-testid="monitor-toggle-ladder"
          >
            {ladderOpen ? "Hide ladder" : "Ladder"}
          </button>
        ) : null}
        {onToggleIntel ? (
          <button
            type="button"
            className="tt-monitor__drawer-btn tt-monitor__tablet-only"
            onClick={onToggleIntel}
            data-testid="monitor-toggle-intel"
          >
            Details
          </button>
        ) : null}
        <div data-guide="monitor-profile">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}
