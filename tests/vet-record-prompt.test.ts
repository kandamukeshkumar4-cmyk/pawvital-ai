import { createSession } from "@/lib/triage-engine";
import { shouldPromptVetRecordUpload } from "@/lib/symptom-chat/vet-record-prompt";

describe("vet record proactive prompt", () => {
  it("prompts on history-phase questions when no record context exists", () => {
    const session = createSession();
    expect(shouldPromptVetRecordUpload(session, "skin_exposure_check")).toBe(true);
  });

  it("does not prompt when vet record context is already stored", () => {
    const session = createSession();
    session.case_memory = {
      ...session.case_memory!,
      vet_record_context: "Recent labs normal",
    };
    expect(shouldPromptVetRecordUpload(session, "skin_exposure_check")).toBe(
      false
    );
  });
});
