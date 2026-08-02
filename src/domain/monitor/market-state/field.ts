export type MetricAvailability =
  | "ok"
  | "unavailable"
  | "stale"
  | "estimated"
  | "flagged";

export interface MetricField<T> {
  availability: MetricAvailability;
  value?: T;
  note?: string;
}

export function ok<T>(value: T, note?: string): MetricField<T> {
  return note ? { availability: "ok", value, note } : { availability: "ok", value };
}

export function unavailable<T = never>(note: string): MetricField<T> {
  return { availability: "unavailable", note };
}

export function stale<T>(value: T, note: string): MetricField<T> {
  return { availability: "stale", value, note };
}

export function flagged<T>(value: T, note: string): MetricField<T> {
  return { availability: "flagged", value, note };
}

export function estimated<T>(value: T, note: string): MetricField<T> {
  return { availability: "estimated", value, note };
}
