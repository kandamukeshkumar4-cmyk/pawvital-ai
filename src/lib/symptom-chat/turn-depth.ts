export type TurnDepth = "standard" | "deep";

export interface TurnDepthContext {
  hasImage: boolean;
  redFlagsTriggered: boolean;
  isReportTurn: boolean;
  isEmergencyEscalation: boolean;
}

export function getConfiguredTurnDepth(): TurnDepth {
  const raw = process.env.SYMPTOM_CHAT_TURN_DEPTH?.trim().toLowerCase();
  return raw === "deep" ? "deep" : "standard";
}

export function resolveTurnDepth(context: TurnDepthContext): TurnDepth {
  if (getConfiguredTurnDepth() === "deep") {
    return "deep";
  }

  if (
    context.hasImage ||
    context.redFlagsTriggered ||
    context.isReportTurn ||
    context.isEmergencyEscalation
  ) {
    return "deep";
  }

  return "standard";
}

export function shouldRunNemotronQuestionGate(turnDepth: TurnDepth): boolean {
  return turnDepth === "deep";
}

export function shouldRunNemotronQuestionVerify(turnDepth: TurnDepth): boolean {
  return turnDepth === "deep";
}

export function shouldRunMiniMaxCompression(turnDepth: TurnDepth): boolean {
  return turnDepth === "deep";
}
