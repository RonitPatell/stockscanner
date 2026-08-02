"use client";

import { Button } from "../ui/button";
import type { SquawkSettings, SquawkPriorityLevel } from "@/lib/squawk";
import { SQUAWK_ENGINE_VERSION } from "@/lib/squawk";
import { Volume2, VolumeX, RotateCcw } from "lucide-react";

const PRIORITIES: SquawkPriorityLevel[] = ["low", "normal", "high", "critical"];

interface Props {
  settings: SquawkSettings;
  onChange: (s: SquawkSettings) => void;
  speechSupported: boolean;
  lastScript?: string | null;
  onReplay: () => void;
  onMute: () => void;
  onUnmute: () => void;
}

export function SquawkControls({
  settings,
  onChange,
  speechSupported,
  lastScript,
  onReplay,
  onMute,
  onUnmute,
}: Props) {
  return (
    <div
      className="rounded-lg border border-[--border] bg-black/20 p-3 space-y-2"
      data-guide="audio-squawk"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-[--text-primary]">Audio Squawk</h3>
          <p className="text-[10px] text-[--text-muted]">
            Structured two-sentence readouts · {SQUAWK_ENGINE_VERSION}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            onClick={onReplay}
            disabled={!lastScript || settings.muted}
            aria-label="Replay last squawk"
          >
            <RotateCcw className="w-3 h-3 mr-1" /> Replay
          </Button>
          {settings.muted ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              onClick={onUnmute}
              aria-label="Unmute squawk"
            >
              <Volume2 className="w-3 h-3 mr-1" /> Unmute
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              onClick={onMute}
              aria-label="Mute squawk"
            >
              <VolumeX className="w-3 h-3 mr-1" /> Mute
            </Button>
          )}
        </div>
      </div>

      {!speechSupported && (
        <p className="text-[11px] text-amber-300/90" role="status">
          Speech synthesis is not supported in this browser. Squawk controls stay available
          for settings; audio will not play.
        </p>
      )}

      <label className="flex items-center gap-2 text-[11px] text-[--text-secondary]">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => onChange({ ...settings, enabled: e.target.checked })}
        />
        Enable Audio Squawk
      </label>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <label className="flex items-center gap-1.5 text-[--text-secondary]">
          <input
            type="checkbox"
            checked={settings.watchlistOnly}
            onChange={(e) =>
              onChange({ ...settings, watchlistOnly: e.target.checked })
            }
          />
          Watchlist only
        </label>
        <label className="flex items-center gap-1.5 text-[--text-secondary]">
          <input
            type="checkbox"
            checked={settings.riskOnly}
            onChange={(e) => onChange({ ...settings, riskOnly: e.target.checked })}
          />
          Risk only
        </label>
        <label className="flex items-center gap-1.5 text-[--text-secondary] col-span-2">
          <input
            type="checkbox"
            checked={settings.strategyMatchOnly}
            onChange={(e) =>
              onChange({ ...settings, strategyMatchOnly: e.target.checked })
            }
          />
          Strategy match only (Monitor)
        </label>
      </div>

      <label className="block text-[10px] text-[--text-muted]">
        Min priority
        <select
          value={settings.minPriority}
          onChange={(e) =>
            onChange({
              ...settings,
              minPriority: e.target.value as SquawkPriorityLevel,
            })
          }
          className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-3 gap-2 text-[10px] text-[--text-muted]">
        <label>
          Rate
          <input
            type="range"
            min={0.7}
            max={1.4}
            step={0.05}
            value={settings.voice.rate}
            onChange={(e) =>
              onChange({
                ...settings,
                voice: { ...settings.voice, rate: Number(e.target.value) },
              })
            }
            className="w-full"
            aria-label="Speech rate"
          />
        </label>
        <label>
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.voice.volume}
            onChange={(e) =>
              onChange({
                ...settings,
                voice: { ...settings.voice, volume: Number(e.target.value) },
              })
            }
            className="w-full"
            aria-label="Speech volume"
          />
        </label>
        <label className="flex items-center gap-1 pt-3">
          <input
            type="checkbox"
            checked={settings.quietHours.enabled}
            onChange={(e) =>
              onChange({
                ...settings,
                quietHours: {
                  ...settings.quietHours,
                  enabled: e.target.checked,
                },
              })
            }
          />
          Quiet hours (ET)
        </label>
      </div>

      {lastScript && (
        <p className="text-[10px] text-[--text-muted] line-clamp-2" aria-live="polite">
          Last: {lastScript}
        </p>
      )}
    </div>
  );
}
