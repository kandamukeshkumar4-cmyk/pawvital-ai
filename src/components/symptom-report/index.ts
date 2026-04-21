export type {
  SymptomReport,
  DifferentialDiagnosis,
  RecommendedTest,
  HomeCare,
  StructuredEvidenceChainItem,
  SimilarCase,
  ReferenceImage,
  EvidenceSummary,
  OutcomeFeedbackSubmitPayload,
} from "./types";
export { FullReport } from "./full-report";
export { BayesianDifferentials, type ScoredDifferential } from "./bayesian-differentials";
export { CollapsibleSection } from "./collapsible-section";
export { SeverityHeader } from "./severity-header";
export { EvidenceSourcesBar } from "./evidence-sources-bar";
export { SimilarCasesSection } from "./similar-cases";
export { ReferenceImagesSection, humanizeLabel } from "./reference-images";
export { DifferentialDiagnoses } from "./differential-diagnoses";
export { ClinicalNotesSection } from "./clinical-notes";
export { EvidenceChainSection } from "./evidence-chain";
export { RecommendedTestsSection } from "./recommended-tests";
export { HomeCareSection } from "./home-care";
export { ActionStepsSection } from "./action-steps";
export { OwnerSummarySection } from "./owner-summary";
export { VetQuestionsSection } from "./vet-questions";
export { VetHandoffSection } from "./vet-handoff";
export { OutcomeFeedbackSection } from "./outcome-feedback";
export { severityConfig, likelihoodColors, urgencyColors } from "./constants";
