export type { StructuredEvidenceChainItem } from "@/lib/evidence-chain";
import type { StructuredEvidenceChainItem } from "@/lib/evidence-chain";
import type {
  TesterFeedbackConfusingArea,
  TesterFeedbackHelpfulness,
  TesterFeedbackSurface,
  TesterFeedbackTrustLevel,
} from "@/lib/tester-feedback-contract";

export interface DifferentialDiagnosis {
  condition: string;
  likelihood: "high" | "moderate" | "low";
  description: string;
}

export interface RecommendedTest {
  test: string;
  reason: string;
  urgency: "stat" | "urgent" | "routine";
}

export interface HomeCare {
  instruction: string;
  duration: string;
  details: string;
}

export interface SimilarCase {
  heading: string;
  body: string;
  similarity: number;
  keyword_tags: string[];
}

export interface ReferenceImage {
  condition_label: string;
  caption?: string;
  asset_url?: string;
  local_path?: string;
  similarity: number;
}

export interface EvidenceSummary {
  cases_found: number;
  knowledge_chunks_found: number;
  reference_images_found: number;
  deterministic_rules_applied?: number;
  provenance_backed_claims?: number;
  retrieval_sources_found?: number;
}

export interface ConfidenceAdjustment {
  factor: string;
  delta: number;
  direction: "increase" | "decrease" | "neutral";
  reason: string;
}

export interface ConfidenceCalibrationSummary {
  final_confidence: number;
  base_confidence: number;
  adjustments: ConfidenceAdjustment[];
  confidence_level: "very_low" | "low" | "moderate" | "high" | "very_high";
  recommendation: string;
}

export interface SymptomReport {
  severity: "low" | "medium" | "high" | "emergency";
  recommendation: "monitor" | "vet_48h" | "vet_24h" | "emergency_vet";
  title: string;
  explanation: string;
  differential_diagnoses?: DifferentialDiagnosis[];
  clinical_notes?: string;
  recommended_tests?: RecommendedTest[];
  home_care?: HomeCare[];
  actions: string[];
  warning_signs: string[];
  limitations?: string[];
  vet_questions?: string[];
  confidence?: number;
  calibrated_confidence?: ConfidenceCalibrationSummary | null;
  confidence_calibration?: ConfidenceCalibrationSummary;
  evidenceChain?: StructuredEvidenceChainItem[];
  vet_handoff_summary?: string;
  async_review_scheduled?: boolean;
  report_storage_id?: string;
  outcome_feedback_enabled?: boolean;
  system_observability?: {
    timeoutCount?: number;
    fallbackCount?: number;
  };
  similar_cases?: SimilarCase[];
  reference_images?: ReferenceImage[];
  bayesian_differentials?: Array<{ condition: string; probability: number; evidence_count: number; confidence?: string }>;
  knowledge_sources_used?: string[];
  evidence_summary?: EvidenceSummary;
  provenance_registry_version?: string;
  high_stakes_claims_suppressed?: boolean;
}

export type OutcomeFeedbackSubmitPayload = {
  symptomCheckId: string;
  helpfulness: TesterFeedbackHelpfulness;
  confusingAreas: TesterFeedbackConfusingArea[];
  trustLevel: TesterFeedbackTrustLevel;
  notes: string;
  surface?: TesterFeedbackSurface;
};
