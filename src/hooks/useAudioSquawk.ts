"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalystItem } from "@/types";
import {
  catalystToUtterance,
  clearQueue,
  completeCurrent,
  createEmptyQueue,
  detectSpeechSynthesis,
  enqueueSquawk,
  loadSquawkSettings,
  saveSquawkSettings,
  type SquawkQueueState,
  type SquawkSettings,
  type SquawkUtterance,
  DEFAULT_SQUAWK_SETTINGS,
} from "@/lib/squawk";

function speakBrowser(
  utterance: SquawkUtterance,
  settings: SquawkSettings,
  onEnd: () => void
): SpeechSynthesisUtterance | null {
  const support = detectSpeechSynthesis(typeof window !== "undefined" ? window : null);
  if (!support.supported) {
    onEnd();
    return null;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(utterance.script);
  u.rate = settings.voice.rate;
  u.pitch = settings.voice.pitch;
  u.volume = settings.voice.volume;
  if (settings.voice.voiceURI) {
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(
      (v) => v.voiceURI === settings.voice.voiceURI || v.name === settings.voice.voiceURI
    );
    if (match) u.voice = match;
  }
  u.onend = () => onEnd();
  u.onerror = () => onEnd();
  window.speechSynthesis.speak(u);
  return u;
}

export function useAudioSquawk(opts: {
  watchlist: Set<string>;
  enabled?: boolean;
}) {
  const [settings, setSettingsState] = useState<SquawkSettings>(DEFAULT_SQUAWK_SETTINGS);
  const [queue, setQueue] = useState<SquawkQueueState>(() => createEmptyQueue());
  const [lastSpoken, setLastSpoken] = useState<SquawkUtterance | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const settingsRef = useRef(settings);
  const queueRef = useRef(queue);
  const speakingRef = useRef(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    setSettingsState(loadSquawkSettings());
    const support = detectSpeechSynthesis(
      typeof window !== "undefined" ? window : null
    );
    setSpeechSupported(support.supported);
  }, []);

  const setSettings = useCallback((next: SquawkSettings | ((s: SquawkSettings) => SquawkSettings)) => {
    setSettingsState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      saveSquawkSettings(resolved);
      return resolved;
    });
  }, []);

  const advance = useCallback(() => {
    speakingRef.current = false;
    const { state, speakNow } = completeCurrent(queueRef.current);
    setQueue(state);
    queueRef.current = state;
    if (speakNow && !settingsRef.current.muted && settingsRef.current.enabled) {
      speakingRef.current = true;
      setLastSpoken(speakNow);
      speakBrowser(speakNow, settingsRef.current, () => {
        advance();
      });
    }
  }, []);

  const pushCatalyst = useCallback(
    (c: CatalystItem) => {
      const s = settingsRef.current;
      if (!s.enabled || opts.enabled === false) return;
      const { utterance, skipReason } = catalystToUtterance(c, {
        onWatchlist: opts.watchlist.has(c.symbol.toUpperCase()),
        settings: s,
      });
      if (!utterance) {
        void skipReason;
        return;
      }
      const result = enqueueSquawk(queueRef.current, utterance);
      setQueue(result.state);
      queueRef.current = result.state;

      if (result.interrupt && typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
        speakingRef.current = false;
      }
      if (result.speakNow) {
        speakingRef.current = true;
        setLastSpoken(result.speakNow);
        speakBrowser(result.speakNow, s, () => advance());
      }
    },
    [opts.watchlist, opts.enabled, advance]
  );

  const mute = useCallback(() => {
    setSettings((s) => ({ ...s, muted: true }));
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setQueue((q) => clearQueue(q));
    speakingRef.current = false;
  }, [setSettings]);

  const unmute = useCallback(() => {
    setSettings((s) => ({ ...s, muted: false }));
  }, [setSettings]);

  const replay = useCallback(() => {
    if (!lastSpoken || settingsRef.current.muted) return;
    speakBrowser(lastSpoken, settingsRef.current, () => {});
  }, [lastSpoken]);

  return {
    settings,
    setSettings,
    queue,
    lastSpoken,
    speechSupported,
    pushCatalyst,
    mute,
    unmute,
    replay,
  };
}
