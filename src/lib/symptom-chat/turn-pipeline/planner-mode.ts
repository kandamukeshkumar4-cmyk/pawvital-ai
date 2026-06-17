export type ClinicalPlannerMode = "legacy" | "shadow" | "live";

export function getClinicalPlannerMode(
  env: NodeJS.ProcessEnv = process.env
): ClinicalPlannerMode {
  const raw = env.CLINICAL_PLANNER_MODE?.trim().toLowerCase();
  if (raw === "legacy" || raw === "live") {
    return raw;
  }
  return "shadow";
}

export function shouldUseLegacyQuestionSelection(mode: ClinicalPlannerMode): boolean {
  return mode === "legacy";
}

export function shouldRecordPlannerShadow(mode: ClinicalPlannerMode): boolean {
  return mode === "shadow" || mode === "live";
}

export function shouldUsePlannerQuestionLive(
  mode: ClinicalPlannerMode,
  plannerQuestionId: string | null
): boolean {
  return mode === "live" && Boolean(plannerQuestionId);
}
