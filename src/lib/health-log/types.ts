/**
 * Daily Health Log domain types.
 *
 * Owner-facing structured daily logging. These enums are the single source of
 * truth shared by the SQL CHECK constraints, the API zod schema, the log form,
 * and the readout. Tone classifies a value as good / watch / alert for plain
 * owner feedback — it is NOT a diagnosis, just a reflection of what was logged.
 */

export type Appetite = "normal" | "reduced" | "none" | "increased";
export type Water = "normal" | "less" | "more";
export type Stool = "normal" | "soft" | "diarrhea" | "none" | "blood";
export type Urination = "normal" | "less" | "more" | "straining" | "none";
export type Energy = "normal" | "low" | "high";

export type LogTone = "good" | "watch" | "alert";

export interface HealthLogInput {
  pet_id: string;
  /** YYYY-MM-DD. Defaults to today server-side when omitted. */
  log_date?: string;
  appetite: Appetite;
  water: Water;
  stool: Stool;
  urination: Urination;
  vomiting_count: number;
  energy: Energy;
  weight_kg?: number | null;
  meds_given: boolean;
  notes?: string | null;
}

export interface HealthLog extends HealthLogInput {
  id: string;
  user_id: string;
  log_date: string;
  weight_kg: number | null;
  notes: string | null;
  photo_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface FieldOption<T extends string> {
  value: T;
  label: string;
  tone: LogTone;
}

export interface FieldDef<T extends string> {
  key: "appetite" | "water" | "stool" | "urination" | "energy";
  label: string;
  options: FieldOption<T>[];
}

/**
 * Form/readout field metadata. `tone` marks how concerning a value is so the
 * readout can flag "off" fields and the form can hint without alarming.
 */
export const APPETITE_FIELD: FieldDef<Appetite> = {
  key: "appetite",
  label: "Appetite",
  options: [
    { value: "normal", label: "Normal", tone: "good" },
    { value: "reduced", label: "Eating less", tone: "watch" },
    { value: "none", label: "Not eating", tone: "alert" },
    { value: "increased", label: "Eating more", tone: "watch" },
  ],
};

export const WATER_FIELD: FieldDef<Water> = {
  key: "water",
  label: "Water",
  options: [
    { value: "normal", label: "Normal", tone: "good" },
    { value: "less", label: "Drinking less", tone: "watch" },
    { value: "more", label: "Drinking more", tone: "watch" },
  ],
};

export const STOOL_FIELD: FieldDef<Stool> = {
  key: "stool",
  label: "Stool",
  options: [
    { value: "normal", label: "Normal", tone: "good" },
    { value: "soft", label: "Soft", tone: "watch" },
    { value: "diarrhea", label: "Diarrhea", tone: "alert" },
    { value: "none", label: "None", tone: "watch" },
    { value: "blood", label: "Blood", tone: "alert" },
  ],
};

export const URINATION_FIELD: FieldDef<Urination> = {
  key: "urination",
  label: "Urination",
  options: [
    { value: "normal", label: "Normal", tone: "good" },
    { value: "less", label: "Less", tone: "watch" },
    { value: "more", label: "More", tone: "watch" },
    { value: "straining", label: "Straining", tone: "alert" },
    { value: "none", label: "Not urinating", tone: "alert" },
  ],
};

export const ENERGY_FIELD: FieldDef<Energy> = {
  key: "energy",
  label: "Energy",
  options: [
    { value: "normal", label: "Normal", tone: "good" },
    { value: "low", label: "Low / sluggish", tone: "watch" },
    { value: "high", label: "Restless / high", tone: "watch" },
  ],
};

export const SELECT_FIELDS = [
  APPETITE_FIELD,
  WATER_FIELD,
  STOOL_FIELD,
  URINATION_FIELD,
  ENERGY_FIELD,
] as const;

export const DEFAULT_LOG_INPUT: Omit<HealthLogInput, "pet_id"> = {
  appetite: "normal",
  water: "normal",
  stool: "normal",
  urination: "normal",
  vomiting_count: 0,
  energy: "normal",
  weight_kg: null,
  meds_given: false,
  notes: null,
};
