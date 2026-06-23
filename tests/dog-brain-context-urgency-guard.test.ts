/**
 * VET-DOG-BRAIN #2 safety guard.
 *
 * The Dog Brain 90-day memory is injected into case_memory.daily_log_context as
 * SUPPORTIVE context during symptom checking. This test proves it can NEVER
 * downgrade the deterministic urgency: an emergency red-flag stays "emergency"
 * even when the owner's recent daily logs all look perfectly normal.
 */
import {
  addSymptoms,
  buildDiagnosisContext,
  createSession,
  recordAnswer,
  type PetProfile,
  type TriageSession,
} from "@/lib/triage-engine";
import { ensureStructuredCaseMemory } from "@/lib/symptom-memory";
import { deriveBrainQuestionTrace } from "@/lib/symptom-chat/answer-coercion";
import { brainPrioritySymptomEvidence } from "@/lib/dog-brain/question-priority";

const pet: PetProfile = {
  name: "Scout",
  breed: "Mixed Breed",
  age_years: 4,
  weight: 42,
};

function emergencySession(): TriageSession {
  let session = createSession();
  session = addSymptoms(session, ["vomiting"]);
  session = recordAnswer(session, "vomit_blood", true);
  session = recordAnswer(session, "gum_color", "pale_white");
  session = recordAnswer(session, "consciousness_level", "unresponsive");
  return session;
}

/** A glowing "everything is normal" 90-day Brain memory — the worst case for a
 *  memory that might wrongly reassure the engine. */
const BENIGN_BRAIN_CONTEXT =
  "OWNER-LOGGED DAILY HEALTH TRENDS: appetite normal, energy normal, stool " +
  "normal, water normal, no vomiting, weight stable for the last 14 logged days. " +
  "Scout has been completely healthy and bright every single day.";

describe("Dog Brain memory cannot downgrade deterministic urgency", () => {
  it("keeps an emergency at emergency with no Brain context", () => {
    const session = emergencySession();
    const context = buildDiagnosisContext(session, pet);
    expect(session.red_flags_triggered).toEqual(
      expect.arrayContaining(["vomit_blood"]),
    );
    expect(context.highest_urgency).toBe("emergency");
  });

  it("keeps an emergency at emergency even when Brain memory says all normal", () => {
    const base = emergencySession();
    const withBenignMemory: TriageSession = {
      ...base,
      case_memory: {
        ...ensureStructuredCaseMemory(base),
        daily_log_context: BENIGN_BRAIN_CONTEXT,
      },
    };

    const baseUrgency = buildDiagnosisContext(base, pet).highest_urgency;
    const withMemoryUrgency = buildDiagnosisContext(
      withBenignMemory,
      pet,
    ).highest_urgency;

    // The reassuring memory must not lower urgency, and the red flag must survive.
    expect(withMemoryUrgency).toBe("emergency");
    expect(withMemoryUrgency).toBe(baseUrgency);
    expect(withBenignMemory.red_flags_triggered).toEqual(
      expect.arrayContaining(["vomit_blood"]),
    );
  });

  it("Brain question trace is explanation-only — building it never mutates urgency or red flags", () => {
    const session = emergencySession();
    const redFlagsBefore = [...session.red_flags_triggered];
    const urgencyBefore = buildDiagnosisContext(session, pet).highest_urgency;

    const evidenceMap = brainPrioritySymptomEvidence([
      {
        signal_type: "stool_change",
        severity: "watch",
        owner_message: "The latest log shows a stool change.",
        dedupe_key: "stool_change:2026-06-10",
      },
    ]);

    // Even with Brain priority symptoms + evidence present, deriving the trace is
    // a pure read: it cannot change the session, urgency, or red flags. And on an
    // emergency turn the complaint (vomiting) drives selection, so the brain trace
    // for an unrelated diarrhea question stays null when the complaint owns it.
    const trace = deriveBrainQuestionTrace(
      session,
      ["vomiting"],
      ["diarrhea"],
      evidenceMap,
      // A vomiting follow-up the complaint branch owns — not a brain-driven id.
      "vomit_blood",
    );
    expect(trace).toBeNull();

    expect(session.red_flags_triggered).toEqual(redFlagsBefore);
    expect(buildDiagnosisContext(session, pet).highest_urgency).toBe(
      urgencyBefore,
    );
    expect(urgencyBefore).toBe("emergency");
  });
});
