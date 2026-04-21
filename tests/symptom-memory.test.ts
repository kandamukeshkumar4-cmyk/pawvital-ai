import { addSymptoms, createSession } from "@/lib/triage-engine";
import {
  buildCaseMemorySnapshot,
  buildNarrativeSnapshot,
  shouldCompressCaseMemory,
} from "@/lib/symptom-memory";

describe("symptom-memory", () => {
  it("rebuilds compression input from stable state instead of prior summaries", () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.case_memory = {
      ...session.case_memory!,
      chief_complaints: ["limping"],
      active_focus_symptoms: ["limping"],
      confirmed_facts: {
        which_leg: "left back leg",
        limping_onset: "three days ago",
      },
      compressed_summary: "STALE_DERIVED_SUMMARY",
      timeline_notes: ["Owner update about Milo: limping for three days"],
    };

    const snapshot = buildNarrativeSnapshot(
      session,
      [{ role: "user", content: "He is limping on the left back leg." }],
      "He is limping on the left back leg."
    );

    expect(snapshot).toContain("Stable case baseline:");
    expect(snapshot).toContain("which_leg: left back leg");
    expect(snapshot).not.toContain("STALE_DERIVED_SUMMARY");
    expect(snapshot).not.toContain("Compressed case summary:");
  });

  it("keeps the legacy snapshot helper narrative-only", () => {
    const session = createSession();
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: ["internal_pending_question"],
      compressed_summary: "OLD_SUMMARY",
    };

    const snapshot = buildCaseMemorySnapshot(
      session,
      [{ role: "assistant", content: "Can you tell me more?" }],
      "I'm not sure."
    );

    expect(snapshot).toContain("Stable case baseline:");
    expect(snapshot).not.toContain("Open question IDs:");
    expect(snapshot).not.toContain("internal_pending_question");
    expect(snapshot).not.toContain("OLD_SUMMARY");
  });

  it("refreshes compression on answer-only turns before the turn threshold", () => {
    const session = createSession();
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 2,
      last_compressed_turn: 1,
      compressed_summary: "fresh summary",
    };

    expect(
      shouldCompressCaseMemory(
        session,
        [{ role: "user", content: "Yes, drinking normally." }],
        {
          imageAnalyzed: false,
          changedSymptoms: [],
          changedAnswers: ["water_intake"],
        }
      )
    ).toBe(true);
  });

  it("does not refresh compression when nothing material changed", () => {
    const session = createSession();
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 2,
      last_compressed_turn: 1,
      compressed_summary: "fresh summary",
    };

    expect(
      shouldCompressCaseMemory(
        session,
        [{ role: "user", content: "okay" }],
        {
          imageAnalyzed: false,
          changedSymptoms: [],
          changedAnswers: [],
        }
      )
    ).toBe(false);
  });
});
