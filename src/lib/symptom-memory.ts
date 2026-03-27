import { FOLLOW_UP_QUESTIONS } from "./clinical-matrix";
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
    memory.red_flag_notes.length > 0
      ? `Red flag watch: ${memory.red_flag_notes.slice(0, 3).join("; ")}.`
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
    turnsSinceCompression >= 2 ||
    options.imageAnalyzed ||
    options.changedSymptoms.length > 0 ||
    options.changedAnswers.length > 0 ||
    messages.length >= 8
  );
}
