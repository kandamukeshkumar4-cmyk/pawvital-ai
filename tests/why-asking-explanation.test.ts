/**
 * "Why I'm asking" contextual rationale — display-only enrichment.
 *
 * Proves the banner becomes a logical, chained explanation (complaint → purpose
 * → reasoning chain → escalation → log pattern) and that it NEVER regresses:
 * with nothing curated to anchor on it returns the base reason unchanged.
 */
import {
  addSymptoms,
  createSession,
  recordAnswer,
  type TriageSession,
} from "@/lib/triage-engine";
import { composeWhyAsking } from "@/lib/symptom-chat/why-asking-explanation";

const GUM_CARD_REASON =
  "Changes in gum color can signal poor circulation or oxygenation and may indicate a serious underlying issue.";

function vomitingSession(): TriageSession {
  let s = createSession();
  s = addSymptoms(s, ["vomiting"]);
  // one earlier answer so the "after your earlier answers" chain applies
  s = recordAnswer(s, "emergency_global_screen", false);
  return s;
}

describe("composeWhyAsking — contextual, chained, log-aware", () => {
  it("links the reported symptom, the clinical purpose, the chain, escalation, and logs", () => {
    const out = composeWhyAsking({
      questionId: "gum_color_check",
      baseReason: GUM_CARD_REASON,
      session: vomitingSession(),
      brainEvidenceSummary: "Vomiting was reported 2 times across the latest 3 logged days.",
    });
    expect(out).toBeTruthy();
    const text = (out ?? "").toLowerCase();
    expect(text).toContain("vomiting"); // the owner's reported complaint
    expect(text).toContain("gum color"); // the curated clinical purpose (core)
    expect(text).toContain("after your earlier answers"); // reasoning chain
    expect(text).toContain("urgent"); // escalation, from curated changesUrgencyIf
    expect(text).toContain("recent logs"); // 1–90 day pattern tie-in
  });

  it("omits the log tie-in when there is no Brain evidence", () => {
    const out = composeWhyAsking({
      questionId: "gum_color_check",
      baseReason: GUM_CARD_REASON,
      session: vomitingSession(),
      brainEvidenceSummary: null,
    });
    expect((out ?? "").toLowerCase()).not.toContain("recent logs");
    expect(out).toContain("gum color"); // still contextual
  });

  it("never regresses: no card and no base reason → null (no banner)", () => {
    expect(
      composeWhyAsking({
        questionId: "no_such_card_id",
        baseReason: null,
        session: vomitingSession(),
      }),
    ).toBeNull();
  });

  it("falls back to the base reason text when the question has no card", () => {
    const out = composeWhyAsking({
      questionId: "no_such_card_id",
      baseReason: "Some specific clinical reason.",
      session: vomitingSession(),
    });
    expect(out).toContain("Some specific clinical reason.");
    // no card ⇒ no curated chain/escalation phrasing
    expect((out ?? "").toLowerCase()).not.toContain("after your earlier answers");
  });

  it("stays within a tidy banner length", () => {
    const out = composeWhyAsking({
      questionId: "gum_color_check",
      baseReason: GUM_CARD_REASON,
      session: vomitingSession(),
      brainEvidenceSummary: "Vomiting was reported 2 times across the latest 3 logged days.",
    });
    expect((out ?? "").length).toBeLessThanOrEqual(360);
  });
});
