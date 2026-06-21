export type SignalSeverity = "info" | "watch" | "alert";

export type BriefState = "stable" | "watch" | "needs_attention";

export type SignalType =
  | "appetite_drop"
  | "stool_change"
  | "vomiting_trend"
  | "weight_downtrend"
  | "water_urination_change"
  | "mobility_pain_change"
  | "breathing_cough_change"
  | "skin_ear_change"
  | "possible_med_side_effect";

export interface DetectedSignal {
  signal_type: SignalType;
  severity: SignalSeverity;
  owner_message: string;
  dedupe_key: string;
  next_action?: string;
}

export interface DogBrainSignalsResponse {
  state: BriefState;
  signals: DetectedSignal[];
}
