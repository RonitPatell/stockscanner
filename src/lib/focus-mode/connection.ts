/**
 * Live delivery connection health for Focus Mode / Squawk.
 */

export type DeliveryConnectionState =
  | "connected"
  | "connecting"
  | "disconnected"
  | "unsupported";

export interface DeliveryHealth {
  state: DeliveryConnectionState;
  lastEventAt: number | null;
  lastEventId: string | null;
  warning: string | null;
}

export function createDeliveryHealth(
  partial?: Partial<DeliveryHealth>
): DeliveryHealth {
  return {
    state: partial?.state ?? "connecting",
    lastEventAt: partial?.lastEventAt ?? null,
    lastEventId: partial?.lastEventId ?? null,
    warning: partial?.warning ?? null,
  };
}

export function onDeliveryOpen(prev: DeliveryHealth): DeliveryHealth {
  return {
    ...prev,
    state: "connected",
    warning: null,
  };
}

export function onDeliveryEvent(
  prev: DeliveryHealth,
  opts: { at?: number; eventId?: string | null }
): DeliveryHealth {
  return {
    ...prev,
    state: "connected",
    lastEventAt: opts.at ?? Date.now(),
    lastEventId: opts.eventId ?? prev.lastEventId,
    warning: null,
  };
}

export function onDeliveryError(prev: DeliveryHealth): DeliveryHealth {
  return {
    ...prev,
    state: "disconnected",
    warning:
      "Live delivery disconnected. Showing last received feed — reconnecting. Do not assume quotes or alerts are fresh.",
  };
}

export function onDeliveryUnsupported(): DeliveryHealth {
  return {
    state: "unsupported",
    lastEventAt: null,
    lastEventId: null,
    warning:
      "Live streaming is not supported in this browser. Falling back to polling when available.",
  };
}

/** True when UI should show a prominent disconnect banner */
export function shouldWarnDisconnect(h: DeliveryHealth): boolean {
  return h.state === "disconnected" || h.state === "unsupported";
}
