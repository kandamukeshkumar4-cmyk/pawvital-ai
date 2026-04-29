export type VetKnowledgePublisher =
  | "Merck"
  | "Cornell"
  | "AAHA"
  | "AVMA"
  | "InternalVetReviewed";

export type VetKnowledgeLicenseStatus =
  | "link_only"
  | "summarized"
  | "internal_allowed";

export type VetKnowledgeAllowedUse =
  | "retrieval_summary_only"
  | "owner_visible_citation"
  | "internal_reasoning";

export interface VetKnowledgeSource {
  id: string;
  title: string;
  publisher: VetKnowledgePublisher;
  url?: string;
  topic: string;
  complaintFamilies: string[];
  redFlags: string[];
  lastReviewedAt: string;
  licenseStatus: VetKnowledgeLicenseStatus;
  allowedUse: VetKnowledgeAllowedUse;
}

export interface RegistryValidationResult {
  valid: boolean;
  duplicateIds: string[];
  missingRequiredFields: string[];
  missingReviewedAt: string[];
  treatmentInstructionViolations: string[];
}

const REQUIRED_FIELDS: (keyof VetKnowledgeSource)[] = [
  "id",
  "title",
  "publisher",
  "topic",
  "complaintFamilies",
  "lastReviewedAt",
  "licenseStatus",
  "allowedUse",
];

const TREATMENT_INSTRUCTION_PATTERNS = [
  /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose|times\s+a\s+day)/i,
  /administer\s+\w+\s*(mg|ml|tablet|pill|dose)/i,
  /dosage\s*(is|of|:)/i,
  /prescribe/i,
  /treatment\s*(plan|protocol|regimen)/i,
  /home\s*[-\s]*care\s*(instructions?|steps?|tips?)/i,
  /apply\s+(a\s+)?(bandage|ointment|cream|compress)/i,
  /feed\s+(your\s+)?(pet|dog|cat)\s+/i,
];

function containsTreatmentInstructions(text: string): boolean {
  return TREATMENT_INSTRUCTION_PATTERNS.some((pattern) =>
    pattern.test(text)
  );
}

let registry: VetKnowledgeSource[] = [];

export function setRegistry(sources: VetKnowledgeSource[]): void {
  registry = sources;
}

export function getAllSources(): VetKnowledgeSource[] {
  return registry.map((s) => ({
    ...s,
    complaintFamilies: [...s.complaintFamilies],
    redFlags: [...s.redFlags],
  }));
}

export function getSourceById(id: string): VetKnowledgeSource | undefined {
  const source = registry.find((s) => s.id === id);
  return source
    ? {
        ...source,
        complaintFamilies: [...source.complaintFamilies],
        redFlags: [...source.redFlags],
      }
    : undefined;
}

export function getSourcesByComplaintFamily(
  family: string
): VetKnowledgeSource[] {
  return registry
    .filter((s) => s.complaintFamilies.includes(family))
    .map((s) => ({
      ...s,
      complaintFamilies: [...s.complaintFamilies],
      redFlags: [...s.redFlags],
    }));
}

export function getSourcesByRedFlag(
  redFlag: string
): VetKnowledgeSource[] {
  return registry
    .filter((s) => s.redFlags.includes(redFlag))
    .map((s) => ({
      ...s,
      complaintFamilies: [...s.complaintFamilies],
      redFlags: [...s.redFlags],
    }));
}

export function getSourcesByAllowedUse(
  use: VetKnowledgeAllowedUse
): VetKnowledgeSource[] {
  return registry
    .filter((s) => s.allowedUse === use)
    .map((s) => ({
      ...s,
      complaintFamilies: [...s.complaintFamilies],
      redFlags: [...s.redFlags],
    }));
}

export function validateRegistry(
  sources?: VetKnowledgeSource[]
): RegistryValidationResult {
  const target = sources ?? registry;

  const duplicateIds: string[] = [];
  const missingRequiredFields: string[] = [];
  const missingReviewedAt: string[] = [];
  const treatmentInstructionViolations: string[] = [];

  const seenIds = new Set<string>();

  for (const source of target) {
    if (seenIds.has(source.id)) {
      duplicateIds.push(source.id);
    }
    seenIds.add(source.id);

    for (const field of REQUIRED_FIELDS) {
      const value = source[field];
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0)
      ) {
        missingRequiredFields.push(`${source.id}.${String(field)}`);
      }
    }

    if (!source.lastReviewedAt || source.lastReviewedAt.trim() === "") {
      missingReviewedAt.push(source.id);
    }

    const summaryText = [source.title, source.topic].join(" ");
    if (containsTreatmentInstructions(summaryText)) {
      treatmentInstructionViolations.push(source.id);
    }
  }

  const valid =
    duplicateIds.length === 0 &&
    missingRequiredFields.length === 0 &&
    missingReviewedAt.length === 0 &&
    treatmentInstructionViolations.length === 0;

  return {
    valid,
    duplicateIds,
    missingRequiredFields,
    missingReviewedAt,
    treatmentInstructionViolations,
  };
}
