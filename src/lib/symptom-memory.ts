import { FOLLOW_UP_QUESTIONS } from "./clinical-matrix";
import type {
  ConsultOpinion,
  RetrievalImageEvidence,
  RetrievalTextEvidence,
  ServiceTimeoutRecord,
  VisionClinicalEvidence,
} from "./clinical-evidence";
import type {
  PetProfile,
  StructuredCaseMemory,
  TriageSession,
} from "./triage-engine";

type ScalarFact = string | boolean | number;

interface TurnMemoryUpdate {
  latestUserMessage: string;
  imageAnalyzed: boolean;
  imageSummary?: string | null;
  imageSymptoms?: string[];
  imageRedFlags?: string[];
  turnFocusSymptoms?: string[];
  nextQuestionId?: string | null;
  missingQuestionIds?: string[];
  visualEvidence?: VisionClinicalEvidence | null;
  retrievalEvidence?: Array<RetrievalTextEvidence | RetrievalImageEvidence>;
  consultOpinion?: ConsultOpinion | null;
  serviceTimeouts?: ServiceTimeoutRecord[];
  ambiguityFlags?: string[];
  evidenceNotes?: string[];
  imageInfluencedQuestionSelection?: boolean;
}

function trimLines(lines: string[], limit: number): string[] {
  return lines.slice(Math.max(0, lines.length - limit));
}

function dedupeStrings(values: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped.slice(0, limit);
}

function summarizeFacts(
  facts: Record<string, ScalarFact>,
  limit = 14
): string[] {
  return Object.entries(facts)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, limit)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function buildTimelineLine(
  pet: PetProfile,
  message: string,
  focusSymptoms: string[],
  imageSummary?: string | null
): string {
  const parts = [
    `Owner update about ${pet.name}: ${message.replace(/\s+/g, " ").trim().slice(0, 180)}`,
  ];

  if (focusSymptoms.length > 0) {
    parts.push(`focus=${focusSymptoms.join(", ")}`);
  }

  if (imageSummary) {
    parts.push(`image=${imageSummary.replace(/\s+/g, " ").trim().slice(0, 160)}`);
  }

  return parts.join(" | ");
}

export function ensureStructuredCaseMemory(
  session: TriageSession
): StructuredCaseMemory {
  return (
    session.case_memory || {
      turn_count: 0,
      chief_complaints: [],
      active_focus_symptoms: [],
      confirmed_facts: {},
      image_findings: [],
      red_flag_notes: [],
      unresolved_question_ids: [],
      timeline_notes: [],
      visual_evidence: [],
      retrieval_evidence: [],
      consult_opinions: [],
      evidence_chain: [],
      service_timeouts: [],
      ambiguity_flags: [],
    }
  );
}

export function updateStructuredCaseMemory(
  session: TriageSession,
  pet: PetProfile,
  update: TurnMemoryUpdate
): TriageSession {
  const existing = ensureStructuredCaseMemory(session);
  const confirmedFacts: Record<string, ScalarFact> = {
    ...existing.confirmed_facts,
    ...session.extracted_answers,
  };

  const focusSymptoms = dedupeStrings([
    ...(update.turnFocusSymptoms || []),
    ...session.known_symptoms,
  ], 10);

  const chiefComplaints = dedupeStrings(
    [...existing.chief_complaints, ...session.known_symptoms],
    10
  );

  const imageFindings = dedupeStrings(
    [
      ...existing.image_findings,
      ...(update.imageAnalyzed && update.imageSummary ? [update.imageSummary] : []),
      ...((update.imageSymptoms || []).map((symptom) =>
        `image symptom: ${symptom.replace(/_/g, " ")}`
      )),
    ],
    10
  );

  const redFlagNotes = dedupeStrings(
    [
      ...existing.red_flag_notes,
      ...session.red_flags_triggered.map((flag) =>
        flag.replace(/_/g, " ")
      ),
      ...((update.imageRedFlags || []).map((flag) =>
        `image red flag: ${flag.replace(/_/g, " ")}`
      )),
    ],
    10
  );

  const timelineNotes = trimLines(
    [
      ...existing.timeline_notes,
      buildTimelineLine(
        pet,
        update.latestUserMessage,
        focusSymptoms,
        update.imageAnalyzed ? update.imageSummary : null
      ),
    ],
    14
  );

  const visualEvidence = update.visualEvidence
    ? [
        ...existing.visual_evidence.filter(
          (entry) =>
            !(
              entry.domain === update.visualEvidence?.domain &&
              entry.bodyRegion === update.visualEvidence?.bodyRegion &&
              entry.severity === update.visualEvidence?.severity
            )
        ),
        {
          ...update.visualEvidence,
          influencedQuestionSelection:
            update.imageInfluencedQuestionSelection ??
            update.visualEvidence.influencedQuestionSelection,
        },
      ].slice(-8)
    : existing.visual_evidence;

  const retrievalEvidence = [
    ...existing.retrieval_evidence,
    ...(
      update.retrievalEvidence?.map((entry) => ({
        ...entry,
        summary: entry.summary.replace(/\s+/g, " ").trim().slice(0, 240),
      })) || []
    ),
  ].slice(-12);

  const consultOpinions = update.consultOpinion
    ? [...existing.consult_opinions, update.consultOpinion].slice(-6)
    : existing.consult_opinions;

  const serviceTimeouts = [
    ...existing.service_timeouts,
    ...(update.serviceTimeouts || []),
  ].slice(-10);

  const ambiguityFlags = dedupeStrings(
    [...existing.ambiguity_flags, ...(update.ambiguityFlags || [])],
    10
  );

  const evidenceChain = trimLines(
    [...existing.evidence_chain, ...((update.evidenceNotes || []).slice(0, 4))],
    16
  );

  return {
    ...session,
    case_memory: {
      ...existing,
      turn_count: existing.turn_count + 1,
      chief_complaints: chiefComplaints,
      active_focus_symptoms: focusSymptoms,
      confirmed_facts: confirmedFacts,
      image_findings: imageFindings,
      red_flag_notes: redFlagNotes,
      latest_owner_turn: update.latestUserMessage.trim().slice(0, 400),
      unresolved_question_ids: dedupeStrings(
        [
          ...(update.nextQuestionId ? [update.nextQuestionId] : []),
          ...(update.missingQuestionIds || []),
        ],
        12
      ),
      timeline_notes: timelineNotes,
      visual_evidence: visualEvidence,
      retrieval_evidence: retrievalEvidence,
      consult_opinions: consultOpinions,
      evidence_chain: evidenceChain,
      service_timeouts: serviceTimeouts,
      ambiguity_flags: ambiguityFlags,
    },
  };
}

export function buildDeterministicCaseSummary(
  session: TriageSession,
  pet: PetProfile
): string {
  const memory = ensureStructuredCaseMemory(session);
  const factLines = summarizeFacts(memory.confirmed_facts, 12);
  const nextQuestions = memory.unresolved_question_ids
    .slice(0, 4)
    .map((questionId) => FOLLOW_UP_QUESTIONS[questionId]?.question_text || questionId);

  const sections = [
    `${pet.name} is a ${pet.age_years}-year-old ${pet.breed || pet.species || "pet"} in an active veterinary triage session.`,
    memory.chief_complaints.length > 0
      ? `Main concerns: ${memory.chief_complaints
          .map((symptom) => symptom.replace(/_/g, " "))
          .join(", ")}.`
      : "Main concerns: still being established.",
    factLines.length > 0
      ? `Confirmed facts: ${factLines.join("; ")}.`
      : "Confirmed facts: none recorded yet.",
    memory.image_findings.length > 0
      ? `Image findings: ${memory.image_findings.slice(0, 3).join("; ")}.`
      : "",
    memory.visual_evidence.length > 0
      ? `Structured visual evidence: ${memory.visual_evidence
          .slice(-2)
          .map(
            (entry) =>
              `${entry.domain} ${entry.bodyRegion || "location unknown"} (${entry.severity}, confidence ${entry.confidence.toFixed(2)})`
          )
          .join("; ")}.`
      : "",
    memory.consult_opinions.length > 0
      ? `Consult opinions: ${memory.consult_opinions
          .slice(-2)
          .map((entry) => `${entry.model}: ${entry.summary}`)
          .join("; ")}.`
      : "",
    memory.red_flag_notes.length > 0
      ? `Red flag watch: ${memory.red_flag_notes.slice(0, 3).join("; ")}.`
      : "",
    memory.ambiguity_flags.length > 0
      ? `Open ambiguities: ${memory.ambiguity_flags.slice(0, 4).join("; ")}.`
      : "",
    nextQuestions.length > 0
      ? `Open questions: ${nextQuestions.join(" | ")}.`
      : "",
  ].filter(Boolean);

  return sections.join(" ");
}

export function syncStructuredCaseMemoryQuestions(
  session: TriageSession,
  nextQuestionId: string | null,
  missingQuestionIds: string[]
): TriageSession {
  const memory = ensureStructuredCaseMemory(session);
  return {
    ...session,
    case_memory: {
      ...memory,
      unresolved_question_ids: dedupeStrings(
        [
          ...(nextQuestionId ? [nextQuestionId] : []),
          ...missingQuestionIds,
        ],
        12
      ),
    },
  };
}

export function buildCaseMemorySnapshot(
  session: TriageSession,
  messages: { role: "user" | "assistant"; content: string }[],
  latestUserMessage: string
): string {
  const memory = ensureStructuredCaseMemory(session);
  const factLines = summarizeFacts(memory.confirmed_facts, 14);
  const recentTranscript = messages
    .slice(-8)
    .map((message, index) => {
      const role = message.role === "user" ? "Owner" : "Assistant";
      const compact = message.content.replace(/\s+/g, " ").trim().slice(0, 180);
      return `${index + 1}. ${role}: ${compact}`;
    });

  return [
    memory.compressed_summary
      ? `Compressed case summary:\n${memory.compressed_summary}`
      : "Compressed case summary: none yet",
    `Chief complaints: ${memory.chief_complaints.join(", ") || "none"}`,
    `Active focus symptoms: ${memory.active_focus_symptoms.join(", ") || "none"}`,
    memory.unresolved_question_ids.length > 0
      ? `Open question IDs: ${memory.unresolved_question_ids.join(", ")}`
      : "Open question IDs: none",
    factLines.length > 0
      ? `Structured facts:\n- ${factLines.join("\n- ")}`
      : "Structured facts: none yet",
    memory.image_findings.length > 0
      ? `Image findings:\n- ${memory.image_findings.slice(0, 5).join("\n- ")}`
      : "Image findings: none",
    memory.visual_evidence.length > 0
      ? `Structured visual evidence:\n- ${memory.visual_evidence
          .slice(-4)
          .map(
            (entry) =>
              `${entry.domain} | ${entry.bodyRegion || "unknown region"} | ${entry.findings.join(", ") || "no findings"} | severity=${entry.severity} | confidence=${entry.confidence.toFixed(2)}`
          )
          .join("\n- ")}`
      : "Structured visual evidence: none",
    memory.consult_opinions.length > 0
      ? `Consult opinions:\n- ${memory.consult_opinions
          .slice(-3)
          .map(
            (entry) =>
              `${entry.model} (${entry.mode}) confidence=${entry.confidence.toFixed(2)} | ${entry.summary}`
          )
          .join("\n- ")}`
      : "Consult opinions: none",
    memory.retrieval_evidence.length > 0
      ? `Retrieved evidence:\n- ${memory.retrieval_evidence
          .slice(-6)
          .map((entry) => `${entry.title} | score=${entry.score.toFixed(2)} | ${entry.summary}`)
          .join("\n- ")}`
      : "Retrieved evidence: none",
    memory.evidence_chain.length > 0
      ? `Evidence chain:\n- ${memory.evidence_chain.slice(-6).join("\n- ")}`
      : "Evidence chain: none",
    memory.service_timeouts.length > 0
      ? `Service timeouts:\n- ${memory.service_timeouts
          .slice(-4)
          .map((entry) => `${entry.service}:${entry.stage} (${entry.reason})`)
          .join("\n- ")}`
      : "Service timeouts: none",
    memory.ambiguity_flags.length > 0
      ? `Ambiguity flags:\n- ${memory.ambiguity_flags.join("\n- ")}`
      : "Ambiguity flags: none",
    memory.timeline_notes.length > 0
      ? `Timeline notes:\n- ${memory.timeline_notes.slice(-6).join("\n- ")}`
      : "Timeline notes: none",
    recentTranscript.length > 0
      ? `Recent transcript:\n${recentTranscript.join("\n")}`
      : "Recent transcript: none",
    `Latest owner turn: ${latestUserMessage}`,
  ].join("\n");
}

export function shouldCompressCaseMemory(
  session: TriageSession,
  messages: { role: "user" | "assistant"; content: string }[],
  options: {
    imageAnalyzed: boolean;
    changedSymptoms: string[];
    changedAnswers: string[];
  }
): boolean {
  const memory = ensureStructuredCaseMemory(session);
  const turnsSinceCompression = memory.last_compressed_turn
    ? memory.turn_count - memory.last_compressed_turn
    : Number.POSITIVE_INFINITY;

  return (
    !memory.compressed_summary ||
    turnsSinceCompression >= 4 ||
    options.imageAnalyzed ||
    options.changedSymptoms.length > 0 ||
    messages.length >= 8
  );
}
