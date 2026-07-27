export type SquawkPriorityLevel = "low" | "normal" | "high" | "critical";

export type SquawkVoiceSettings = {
  /** SpeechSynthesis voice URI or name fragment */
  voiceURI: string | null;
  rate: number;
  pitch: number;
  volume: number;
};

export type QuietHours = {
  enabled: boolean;
  /** Minutes from midnight ET (0–1439) */
  startMin: number;
  endMin: number;
};

export type SquawkSettings = {
  enabled: boolean;
  watchlistOnly: boolean;
  riskOnly: boolean;
  /** Minimum priority to speak */
  minPriority: SquawkPriorityLevel;
  quietHours: QuietHours;
  voice: SquawkVoiceSettings;
  muted: boolean;
};

export const DEFAULT_SQUAWK_SETTINGS: SquawkSettings = {
  enabled: false,
  watchlistOnly: false,
  riskOnly: false,
  minPriority: "normal",
  quietHours: { enabled: false, startMin: 22 * 60, endMin: 7 * 60 },
  voice: { voiceURI: null, rate: 1.05, pitch: 1, volume: 0.9 },
  muted: false,
};

export const PRIORITY_RANK: Record<SquawkPriorityLevel, number> = {
  low: 1,
  normal: 2,
  high: 3,
  critical: 4,
};

export interface SquawkScriptInput {
  id: string;
  symbol: string;
  /** Verified fact — structured, not raw article body */
  verifiedFact: string;
  sourceQuality: string;
  moveSincePublicationPct: number | null;
  rVol: number | null;
  tradeability: string | null;
  highestRisk: string | null;
  storyClusterId?: string | null;
  /** Enrichment version / fingerprint for update-vs-repeat */
  contentFingerprint: string;
  /** Optional private fields — must never enter speech */
  phoneNumber?: string | null;
  email?: string | null;
  webhookUrl?: string | null;
  privateNote?: string | null;
  headline?: string | null;
  aiSummary?: string | null;
}

export interface SquawkUtterance {
  id: string;
  catalystId: string;
  symbol: string;
  storyClusterId: string | null;
  contentFingerprint: string;
  script: string;
  priority: SquawkPriorityLevel;
  priorityScore: number;
  createdAt: number;
  isUpdate: boolean;
}

export interface SquawkQueueState {
  speaking: SquawkUtterance | null;
  pending: SquawkUtterance[];
  lastByCluster: Record<string, SquawkUtterance>;
  lastByCatalyst: Record<string, SquawkUtterance>;
}
