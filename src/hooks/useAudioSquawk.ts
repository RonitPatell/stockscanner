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
  monitorEventToUtterance,
  saveSquawkSettings,
  type MonitorSquawkEventInput,
  type SquawkQueueState,
  type SquawkSettings,
  type SquawkUtterance,
  DEFAULT_SQUAWK_SETTINGS,
} from "@/lib/squawk";

function speakBrowser(
  utterance: SquawkUtterance,
  settings: SquawkSettings,
  onEnd: () => void,
  onBlocked?: () => void
): SpeechSynthesisUtterance | null {
  const support = detectSpeechSynthesis(typeof window !== "undefined" ? window : null);
  if (!support.supported) {
    onBlocked?.();
    onEnd();
    return null;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(utterance.script);
    u.rate = settings.voice.rate;
    u.pitch = settings.voice.pitch;
    u.volume = settings.voice.volume;
    if (settings.voice.voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(
        (v) =>
          v.voiceURI === settings.voice.voiceURI ||
          v.name === settings.voice.voiceURI
      );
      if (match) u.voice = match;
    }
    u.onend = () => onEnd();
    u.onerror = () => {
      onBlocked?.();
      onEnd();
    };
    window.speechSynthesis.speak(u);
    return u;
  } catch {
    onBlocked?.();
    onEnd();
    return null;
  }
}

export function useAudioSquawk(opts: {
  watchlist: Set<string>;
  enabled?: boolean;
  /** When speech is blocked/unavailable, still update transcript */
  transcriptOnlyWhenUnavailable?: boolean;
}) {
  const [settings, setSettingsState] = useState<SquawkSettings>(DEFAULT_SQUAWK_SETTINGS);
  const [queue, setQueue] = useState<SquawkQueueState>(() => createEmptyQueue());
  const [lastSpoken, setLastSpoken] = useState<SquawkUtterance | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechBlocked, setSpeechBlocked] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const settingsRef = useRef(settings);
  const queueRef = useRef(queue);
  const speakingRef = useRef(false);

  const markSpeaking = useCallback((on: boolean) => {
    speakingRef.current = on;
    setSpeaking(on);
  }, []);

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

  const recordTranscript = useCallback((utt: SquawkUtterance) => {
    setLastSpoken(utt);
    setTranscript((prev) => [utt.script, ...prev].slice(0, 12));
  }, []);

  const advance = useCallback(() => {
    markSpeaking(false);
    const { state, speakNow } = completeCurrent(queueRef.current);
    setQueue(state);
    queueRef.current = state;
    if (speakNow && !settingsRef.current.muted && settingsRef.current.enabled) {
      markSpeaking(true);
      recordTranscript(speakNow);
      speakBrowser(
        speakNow,
        settingsRef.current,
        () => {
          advance();
        },
        () => setSpeechBlocked(true)
      );
    }
  }, [recordTranscript, markSpeaking]);

  const enqueueAndSpeak = useCallback(
    (utterance: SquawkUtterance) => {
      const s = settingsRef.current;
      const result = enqueueSquawk(queueRef.current, utterance);
      setQueue(result.state);
      queueRef.current = result.state;

      if (result.interrupt && typeof window !== "undefined") {
        try {
          window.speechSynthesis?.cancel();
        } catch {
          /* ignore */
        }
        markSpeaking(false);
      }
      if (result.speakNow) {
        markSpeaking(true);
        recordTranscript(result.speakNow);
        const support = detectSpeechSynthesis(
          typeof window !== "undefined" ? window : null
        );
        if (!support.supported) {
          setSpeechBlocked(true);
          // Still advance queue after a short beat so pending items surface in transcript
          if (opts.transcriptOnlyWhenUnavailable !== false) {
            window.setTimeout(() => advance(), 0);
          }
          return;
        }
        speakBrowser(
          result.speakNow,
          s,
          () => advance(),
          () => setSpeechBlocked(true)
        );
      }
    },
    [advance, recordTranscript, opts.transcriptOnlyWhenUnavailable, markSpeaking]
  );

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
      enqueueAndSpeak(utterance);
    },
    [opts.watchlist, opts.enabled, enqueueAndSpeak]
  );

  const pushMonitorEvent = useCallback(
    (event: MonitorSquawkEventInput) => {
      const s = settingsRef.current;
      if (!s.enabled || opts.enabled === false) return;
      const { utterance, skipReason } = monitorEventToUtterance(event, {
        settings: s,
      });
      if (!utterance) {
        void skipReason;
        return;
      }
      enqueueAndSpeak(utterance);
    },
    [opts.enabled, enqueueAndSpeak]
  );

  const mute = useCallback(() => {
    setSettings((s) => ({ ...s, muted: true }));
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setQueue((q) => clearQueue(q));
    markSpeaking(false);
  }, [setSettings, markSpeaking]);

  const unmute = useCallback(() => {
    setSettings((s) => ({ ...s, muted: false }));
  }, [setSettings]);

  const replay = useCallback(() => {
    if (!lastSpoken || settingsRef.current.muted) return;
    const support = detectSpeechSynthesis(
      typeof window !== "undefined" ? window : null
    );
    if (!support.supported) {
      setSpeechBlocked(true);
      return;
    }
    markSpeaking(true);
    speakBrowser(
      lastSpoken,
      settingsRef.current,
      () => markSpeaking(false),
      () => {
        markSpeaking(false);
        setSpeechBlocked(true);
      }
    );
  }, [lastSpoken, markSpeaking]);

  return {
    settings,
    setSettings,
    queue,
    lastSpoken,
    transcript,
    speechSupported,
    speechBlocked,
    speaking,
    pushCatalyst,
    pushMonitorEvent,
    mute,
    unmute,
    replay,
  };
}
