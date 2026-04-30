export interface ComplaintModule {
  id: string;
  displayNameForLogs: string;
  triggers: string[];
  aliases: string[];

  emergencyScreenQuestionIds: string[];

  phases: Array<{
    id:
      | "emergency_screen"
      | "characterize"
      | "discriminate"
      | "timeline"
      | "history"
      | "handoff";
    questionIds: string[];
    maxQuestionsFromPhase: number;
  }>;

  stopConditions: Array<{
    id: string;
    ifRedFlagPositive?: string[];
    ifAnySignalPresent?: string[];
    ifEnoughInformation?: string[];
    result: "emergency" | "ready_for_report" | "continue";
  }>;

  reportFields: string[];
  safetyNotes: string[];
}
