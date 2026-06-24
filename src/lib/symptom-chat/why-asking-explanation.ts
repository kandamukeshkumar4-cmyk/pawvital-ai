import { getQuestionCardById } from "@/lib/clinical-intelligence/question-card-registry";
import type { TriageSession } from "@/lib/triage-engine";

// =============================================================================
// "Why I'm asking" — contextual, DISPLAY-ONLY question rationale.
//
// Turns the static per-card `shortReason` into a logical, chained explanation
// the owner can follow: what they reported → why THIS question now → what a
// concerning answer would mean → how it links to their 1–90 day logged pattern.
//
// HARD SAFETY CONTRACT (must never be violated):
//  - This is EXPLANATION ONLY. It never selects a question, changes urgency,
//    red flags, or any clinical control state. It only enriches the owner-facing
//    "Why I'm asking" banner text.
//  - It composes ONLY from inputs that already exist: the owner's own reported
//    symptoms, the curated question-card content (shortReason / changesUrgencyIf
//    / phase), and the owner's own logged Brain evidence. It invents no new
//    medical claims and never states a diagnosis.
//  - Pure: no I/O, no model calls. Falls back to the base reason so it is never
//    worse than today.
// =============================================================================

export interface WhyAskingInput {
  /** The question actually being asked this turn. */
  questionId: string | null;
  /** The planner's curated short reason (clinical core); may be null. */
  baseReason: string | null;
  session: TriageSession;
  /** The "Why this came up" Brain memory note, when this turn is log-driven. */
  brainEvidenceSummary?: string | null;
}

const PHASE_CHAIN: Record<string, string> = {
  emergency_screen: "as one of the first safety checks",
  characterize: "to understand what you're seeing",
  discriminate: "to narrow down the most likely cause",
  timeline: "to see how this has changed over time",
  history: "to factor in the background",
  handoff_detail: "so your vet has the full picture",
};

const MAX_LEN = 360;

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function humanizeSymptom(key: string): string {
  return key.replace(/[_-]+/g, " ").trim();
}

/** A short, owner-worded description of what they reported (max 2 symptoms). */
function describeComplaint(session: TriageSession): string | null {
  const symptoms = (session.known_symptoms ?? [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map(humanizeSymptom);
  if (symptoms.length === 0) return null;
  if (symptoms.length === 1) return symptoms[0];
  return `${symptoms[0]} and ${symptoms[1]}`;
}

/** ["a"] → "a"; ["a","b"] → "a and b"; ["a","b","c"] → "a, b and c". */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Compose the contextual "Why I'm asking" line. Returns the base reason
 * unchanged when there is nothing to enrich (never a regression).
 *
 * Shape (≤3 tidy sentences): curated clinical purpose → one context sentence
 * (reasoning chain + reported symptom + log tie-in) → what a concerning answer
 * would mean. The log tie-in lives in the context sentence, not a trailing
 * clause, so it is never lost to length trimming.
 */
export function composeWhyAsking(input: WhyAskingInput): string | null {
  const { questionId, baseReason, session, brainEvidenceSummary } = input;
  const card = questionId ? getQuestionCardById(questionId) : null;
  const core = (baseReason ?? card?.shortReason ?? "").trim();

  // Nothing curated to anchor on → keep prior behavior exactly.
  if (!core) return baseReason ?? null;

  const sentences: string[] = [core];

  const complaint = describeComplaint(session);
  const hasLog = Boolean(brainEvidenceSummary && brainEvidenceSummary.trim());
  const chain = card ? PHASE_CHAIN[card.phase] : null;
  const answeredCount = (session.answered_questions ?? []).length;

  if (chain) {
    // Card-backed: place this question in the reasoning chain + owner context.
    const context: string[] = [];
    if (complaint) context.push(`you mentioned ${complaint}`);
    if (hasLog) context.push("your recent logs show a related pattern");
    const lead =
      answeredCount > 0 ? "After your earlier answers, I'm checking this" : "I'm checking this";
    const tail = context.length > 0 ? ` — ${joinAnd(context)}` : "";
    sentences.push(`${lead} ${chain}${tail}.`);
  } else if (complaint || hasLog) {
    // No card metadata: anchor to the owner's own context only (no fabricated chain).
    const bits: string[] = [];
    if (complaint) bits.push(`you told me about ${complaint}`);
    if (hasLog) bits.push("your recent logs show a related pattern");
    sentences.push(`I'm checking this because ${joinAnd(bits)}.`);
  }

  // What a concerning answer would mean — only from curated escalation data.
  const escalation = card?.changesUrgencyIf?.yes;
  if (escalation && /escalat|emergency|urgent/i.test(escalation)) {
    sentences.push(
      "A concerning answer here would mean urgent care, so it's worth ruling out now.",
    );
  }

  let composed = sentences.join(" ").replace(/\s+/g, " ").trim();
  if (composed.length > MAX_LEN) {
    // Trim to the last full sentence under the cap so the banner stays tidy.
    const clipped = composed.slice(0, MAX_LEN);
    const lastStop = clipped.lastIndexOf(". ");
    composed = lastStop > 0 ? clipped.slice(0, lastStop + 1) : clipped;
  }
  return composed || baseReason || null;
}
