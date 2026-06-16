import type { ServiceTimeoutRecord } from "@/lib/clinical-evidence";
import type { TriageSession } from "@/lib/triage-engine";
import { ensureStructuredCaseMemory } from "@/lib/symptom-memory";
import { TEXT_ONLY_QUESTION_PHRASING_BUDGET_MS } from "@/lib/symptom-chat/question-phrasing";

// Wall-clock budget for one symptom-chat turn. Defaults to 60s — the Vercel
// function ceiling the app currently deploys behind. Deployments with a higher
// platform ceiling can raise it via SYMPTOM_CHAT_MAX_DURATION_SEC (Vercel Pro up
// to 300s; Azure App Service ~230s; Azure Container Apps configurable) so turn 3
// finishes instead of racing the deadline and 504-ing.
// IMPORTANT: never set this above the serving platform's hard request timeout, or
// the function is killed mid-turn. Azure Static Web Apps managed functions cap at
// 45s — if the route is ever served from SWA, set this to 45, not higher.
function resolveTurnBudgetSec(
  raw: string | undefined = process.env.SYMPTOM_CHAT_MAX_DURATION_SEC
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

export const SYMPTOM_CHAT_MAX_DURATION_SEC = resolveTurnBudgetSec();
export const TURN_DEADLINE_SAFETY_MS = 5_000;

export const TURN_STAGE_ESTIMATE_MS = {
  nemotron_review: 8_000,
  nemotron_verify: 8_000,
  llama_phrasing: 20_000,
  glm_safety: 10_000,
  minimax_compression: 8_000,
} as const;

export type TurnStage = keyof typeof TURN_STAGE_ESTIMATE_MS;

const TURN_STAGE_SERVICE: Record<TurnStage, string> = {
  nemotron_review: "nvidia-nemotron",
  nemotron_verify: "nvidia-nemotron",
  llama_phrasing: "nvidia-llama",
  glm_safety: "nvidia-glm",
  minimax_compression: "minimax-memory",
};

export interface TurnDeadline {
  startedAtMs: number;
  budgetMs: number;
  deadlineAtMs: number;
  remainingMs(now?: number): number;
  canAffordStage(stage: TurnStage, now?: number): boolean;
}

export function createTurnDeadline(
  startedAtMs: number,
  maxDurationSec = SYMPTOM_CHAT_MAX_DURATION_SEC
): TurnDeadline {
  const budgetMs = maxDurationSec * 1000 - TURN_DEADLINE_SAFETY_MS;
  const deadlineAtMs = startedAtMs + budgetMs;

  return {
    startedAtMs,
    budgetMs,
    deadlineAtMs,
    remainingMs(now = Date.now()) {
      return Math.max(0, deadlineAtMs - now);
    },
    canAffordStage(stage: TurnStage, now = Date.now()) {
      return this.remainingMs(now) >= TURN_STAGE_ESTIMATE_MS[stage];
    },
  };
}

export function buildStageSkipRecord(
  stage: TurnStage,
  reason = "turn-deadline"
): ServiceTimeoutRecord {
  return {
    service: TURN_STAGE_SERVICE[stage],
    stage,
    reason,
  };
}

export function appendServiceTimeoutToSession(
  session: TriageSession,
  record: ServiceTimeoutRecord
): TriageSession {
  const caseMemory = ensureStructuredCaseMemory(session);
  return {
    ...session,
    case_memory: {
      ...caseMemory,
      service_timeouts: [...caseMemory.service_timeouts, record].slice(-10),
    },
  };
}

export function resolveOwnerVisiblePhrasingDeadline(
  hasPhoto: boolean,
  turnDeadline?: TurnDeadline | null,
  now = Date.now()
): number | null {
  if (hasPhoto) {
    return null;
  }

  const phrasingBudgetDeadline = now + TEXT_ONLY_QUESTION_PHRASING_BUDGET_MS;
  if (!turnDeadline) {
    return phrasingBudgetDeadline;
  }

  return Math.min(turnDeadline.deadlineAtMs, phrasingBudgetDeadline);
}
