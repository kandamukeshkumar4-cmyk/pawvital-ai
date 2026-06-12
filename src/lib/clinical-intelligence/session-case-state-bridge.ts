import type { TriageSession } from "@/lib/triage-engine";
import {
  createInitialClinicalCaseState,
  type ClinicalCaseState,
} from "./case-state";
import {
  recordAnsweredQuestion,
  recordAskedQuestion,
} from "./case-state-update";
import { detectShadowComplaintModuleId } from "./shadow-planner-complaint-adapter";

export interface BuildClinicalCaseStateFromSessionInput {
  session: TriageSession;
  ownerText: string;
}

export function buildClinicalCaseStateFromSession(
  input: BuildClinicalCaseStateFromSessionInput
): ClinicalCaseState {
  const activeComplaintModule =
    detectShadowComplaintModuleId(input.ownerText) ??
    input.session.case_memory?.turn_focus_symptoms?.[0] ??
    null;

  let state = createInitialClinicalCaseState(
    typeof activeComplaintModule === "string" ? activeComplaintModule : null
  );

  const askedIds = new Set<string>([
    ...input.session.answered_questions,
    ...(input.session.last_question_asked ? [input.session.last_question_asked] : []),
  ]);

  for (const questionId of askedIds) {
    state = recordAskedQuestion(state, questionId);
  }

  for (const [answerKey, value] of Object.entries(input.session.extracted_answers)) {
    state = recordAnsweredQuestion(state, answerKey, answerKey, value);
  }

  return state;
}
