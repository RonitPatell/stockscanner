/**
 * Browser SpeechSynthesis feature detection — safe for SSR / unsupported browsers.
 */

export type SpeechSupport = {
  supported: boolean;
  reason: string | null;
};

export function detectSpeechSynthesis(
  g: { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown } | null | undefined
): SpeechSupport {
  if (!g) return { supported: false, reason: "no_window" };
  if (typeof g.speechSynthesis === "undefined") {
    return { supported: false, reason: "speechSynthesis_undefined" };
  }
  if (typeof g.SpeechSynthesisUtterance === "undefined") {
    return { supported: false, reason: "SpeechSynthesisUtterance_undefined" };
  }
  return { supported: true, reason: null };
}

export function detectNotificationActions(
  g: {
    Notification?: { prototype?: { actions?: unknown } } & Function;
  } | null | undefined
): { supported: boolean; reason: string | null } {
  if (!g?.Notification) {
    return { supported: false, reason: "Notification_undefined" };
  }
  // actions support is browser-dependent; presence of maxActions is a proxy
  const n = g.Notification as unknown as { maxActions?: number };
  if (typeof n.maxActions === "number" && n.maxActions > 0) {
    return { supported: true, reason: null };
  }
  // Chromium often supports actions in SW even without maxActions on constructor
  return { supported: false, reason: "notification_actions_unsupported" };
}
