export type SignalSeverity = "info" | "watch" | "alert";

export type SignalType =
  | "appetite_drop"
  | "stool_change"
  | "vomiting_trend"
  | "weight_downtrend"
  | "possible_med_side_effect";

export interface DetectedSignal {
  signal_type: SignalType;
  severity: SignalSeverity;
  owner_message: string;
}
