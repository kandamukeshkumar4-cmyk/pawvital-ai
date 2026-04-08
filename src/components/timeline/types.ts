export interface SymptomCheckEntry {
  id: string;
  pet_id: string;
  pet_name: string;
  created_at: string;
  primary_symptom: string;
  severity: "mild" | "moderate" | "serious" | "critical";
  urgency: "monitor" | "schedule" | "urgent" | "emergency";
  top_diagnosis: string;
  confidence: number;
  report_summary?: string;
}
