"use client";

import type { SquawkSettings } from "@/lib/squawk";

export interface MonitorSquawkBarProps {
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
  muted: boolean;
  onMute: () => void;
  onUnmute: () => void;
  onReplay: () => void;
  speechSupported: boolean;
  speechBlocked: boolean;
  lastScript: string | null;
  transcript: string[];
  settings: SquawkSettings;
  onSettingsChange: (s: SquawkSettings) => void;
  compact?: boolean;
  /** True while browser speech is active (visual indicator only). */
  speaking?: boolean;
}

/**
 * Monitor audio squawk controls — transcript, replay, mute, mode gates.
 * Speaks high-value transitions only (wired by parent).
 */
export function MonitorSquawkBar({
  enabled,
  onEnabledChange,
  muted,
  onMute,
  onUnmute,
  onReplay,
  speechSupported,
  speechBlocked,
  lastScript,
  transcript,
  settings,
  onSettingsChange,
  compact = false,
  speaking = false,
}: MonitorSquawkBarProps) {
  return (
    <div
      className="tt-monitor-squawk"
      data-testid="monitor-squawk-bar"
      data-enabled={enabled ? "true" : "false"}
      data-speaking={speaking ? "true" : "false"}
    >
      <div className="tt-monitor-squawk__row">
        <button
          type="button"
          className="tt-monitor__pill"
          data-testid="monitor-squawk"
          data-tone={enabled && !muted ? "live" : "info"}
          onClick={() => onEnabledChange(!enabled)}
          aria-pressed={enabled}
          title="Audio squawk on/off for Monitor high-value transitions"
        >
          Squawk {enabled ? (muted ? "Muted" : "On") : "Off"}
        </button>

        <button
          type="button"
          className="tt-monitor__drawer-btn"
          onClick={onReplay}
          disabled={!lastScript || muted || !enabled}
          aria-label="Replay last squawk"
          data-testid="monitor-squawk-replay"
        >
          Replay
        </button>

        {muted ? (
          <button
            type="button"
            className="tt-monitor__drawer-btn"
            onClick={onUnmute}
            aria-label="Unmute squawk"
            data-testid="monitor-squawk-unmute"
          >
            Unmute
          </button>
        ) : (
          <button
            type="button"
            className="tt-monitor__drawer-btn"
            onClick={onMute}
            aria-label="Mute squawk"
            data-testid="monitor-squawk-mute"
            disabled={!enabled}
          >
            Mute
          </button>
        )}

        {!compact && (
          <>
            <label className="tt-monitor-squawk__mode">
              <input
                type="checkbox"
                checked={settings.watchlistOnly}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    watchlistOnly: e.target.checked,
                  })
                }
              />
              Watchlist only
            </label>
            <label className="tt-monitor-squawk__mode">
              <input
                type="checkbox"
                checked={settings.strategyMatchOnly}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    strategyMatchOnly: e.target.checked,
                  })
                }
              />
              Strategy match
            </label>
          </>
        )}
      </div>

      {(!speechSupported || speechBlocked) && (
        <p
          className="tt-monitor-squawk__warn"
          role="status"
          data-testid="monitor-squawk-unavailable"
        >
          {!speechSupported
            ? "Browser speech is unavailable — transcript still updates."
            : "Speech was blocked or failed — transcript still updates. Check browser autoplay / speech permissions."}
        </p>
      )}

      <div
        className="tt-monitor-squawk__transcript"
        aria-live="polite"
        aria-relevant="additions"
        data-testid="monitor-squawk-transcript"
      >
        {lastScript ? (
          <>
            <span className="tt-monitor-squawk__transcript-label">Last</span>
            <span className="tt-monitor-squawk__transcript-text">{lastScript}</span>
          </>
        ) : (
          <span className="tt-monitor-squawk__transcript-text tt-monitor-squawk__muted">
            No squawk yet — high-value transitions only.
          </span>
        )}
      </div>

      {!compact && transcript.length > 1 && (
        <ul className="tt-monitor-squawk__history" aria-label="Recent squawk transcript">
          {transcript.slice(1, 5).map((line, i) => (
            <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
