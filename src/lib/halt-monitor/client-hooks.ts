/**
 * Browser/audio hooks for halt alerts (client-side).
 * Wire from LiveScanner or a HaltAlertListener once.
 */
import type { HaltAlertPayload } from "@/lib/halt-monitor/alerts";

export function playHaltAlertBeep(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 660;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.36);
    void ctx.close();
  } catch {
    /* ignore */
  }
}

export async function showHaltBrowserNotification(
  payload: HaltAlertPayload
): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
    }
    if (perm !== "granted") return;
    new Notification(payload.title, {
      body: payload.body,
      tag: `halt-${payload.symbol}-${payload.transition}`,
    });
  } catch {
    /* ignore */
  }
}

export async function handleHaltAlertClient(
  payload: HaltAlertPayload,
  opts?: { sound?: boolean; notify?: boolean }
): Promise<void> {
  if (opts?.sound !== false && payload.playAudio) playHaltAlertBeep();
  if (opts?.notify !== false && payload.browserNotify) {
    await showHaltBrowserNotification(payload);
  }
}
