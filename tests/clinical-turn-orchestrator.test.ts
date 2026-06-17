import { createSession } from "@/lib/triage-engine";
import { runClinicalTurnOrchestrator } from "@/lib/clinical-intelligence/clinical-turn-orchestrator";

describe("clinical turn orchestrator", () => {
  it("records a shadow comparison when planner disagrees with production question", () => {
    const session = createSession();
    const result = runClinicalTurnOrchestrator({
      session,
      ownerText: "My dog is limping on the back left leg since yesterday.",
      productionQuestionId: "which_leg",
    });

    expect(result.integration.activeComplaintModuleId).toBeTruthy();
    expect(result.shadowComparisonRecord).toEqual(
      expect.objectContaining({
        usedStrategy: "which_leg",
        shadowStrategy: expect.any(String),
      })
    );
    expect(result.session.case_memory?.clinical_case_state).toBeTruthy();
  });
});
