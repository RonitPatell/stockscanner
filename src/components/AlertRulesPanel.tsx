"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { AlertRule } from "@/lib/alert-rules";
import { DEFAULT_ALERT_RULES } from "@/lib/alert-rules";
import { Button } from "./ui/button";

interface AlertRulesPanelProps {
  rules: AlertRule[];
  onChange: (rules: AlertRule[]) => void;
}

export function AlertRulesPanel({ rules, onChange }: AlertRulesPanelProps) {
  const list = rules.length ? rules : DEFAULT_ALERT_RULES;

  const updateRule = (id: string, patch: Partial<AlertRule>) => {
    onChange(list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRule = () => {
    onChange([
      ...list,
      {
        id: `rule-${Date.now()}`,
        enabled: true,
        name: "Custom rule",
        scope: "watchlist",
        channels: ["discord"],
        minChangePercent: 3,
        minRvol: 2,
        cooldownMinutes: 15,
        newsAttachedOnly: true,
      },
    ]);
  };

  const removeRule = (id: string) => {
    if (list.length <= 1) return;
    onChange(list.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-3">
      {list.map((rule) => (
        <div
          key={rule.id}
          className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              value={rule.name}
              onChange={(e) => updateRule(rule.id, { name: e.target.value })}
              className="flex-1 bg-transparent text-sm font-medium text-zinc-200 border-b border-zinc-700 focus:border-emerald-500 outline-none"
            />
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
              />
              On
            </label>
            <button
              type="button"
              onClick={() => removeRule(rule.id)}
              className="text-zinc-600 hover:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="text-zinc-500">
              Min % move
              <input
                type="number"
                step="0.5"
                value={rule.minChangePercent ?? ""}
                onChange={(e) =>
                  updateRule(rule.id, {
                    minChangePercent: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
              />
            </label>
            <label className="text-zinc-500">
              Min RVOL
              <input
                type="number"
                step="0.1"
                value={rule.minRvol ?? ""}
                onChange={(e) =>
                  updateRule(rule.id, {
                    minRvol: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
              />
            </label>
            <label className="text-zinc-500">
              Max float (M)
              <input
                type="number"
                value={rule.maxFloatM ?? ""}
                onChange={(e) =>
                  updateRule(rule.id, {
                    maxFloatM: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
              />
            </label>
            <label className="text-zinc-500">
              Cooldown (min)
              <input
                type="number"
                value={rule.cooldownMinutes ?? 15}
                onChange={(e) =>
                  updateRule(rule.id, { cooldownMinutes: Number(e.target.value) || 15 })
                }
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
            <span className="text-zinc-500 w-full">Alert channels:</span>
            {(["discord", "sms", "email", "push"] as const).map((ch) => (
              <label key={ch} className="flex items-center gap-1 capitalize">
                <input
                  type="checkbox"
                  checked={rule.channels.includes(ch)}
                  onChange={(e) => {
                    const channels = e.target.checked
                      ? [...new Set([...rule.channels, ch])]
                      : rule.channels.filter((c) => c !== ch);
                    updateRule(rule.id, { channels: channels.length ? channels : ["discord"] });
                  }}
                />
                {ch}
              </label>
            ))}
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={rule.newsAttachedOnly === true}
                onChange={(e) => updateRule(rule.id, { newsAttachedOnly: e.target.checked })}
              />
              News-attached only
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={rule.requireHod === true}
                onChange={(e) => updateRule(rule.id, { requireHod: e.target.checked })}
              />
              Near HOD
            </label>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addRule} className="w-full">
        <Plus className="w-3.5 h-3.5 mr-1" />
        Add alert rule
      </Button>
    </div>
  );
}
