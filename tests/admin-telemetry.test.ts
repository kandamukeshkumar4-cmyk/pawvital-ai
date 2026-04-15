import {
  buildAdminTelemetryDashboardData,
  buildUnavailableAdminTelemetryDashboardData,
  type AdminTelemetryAggregateInput,
} from "@/lib/admin-telemetry";

function buildInput(
  overrides: Partial<AdminTelemetryAggregateInput> = {}
): AdminTelemetryAggregateInput {
  return {
    generatedAt: "2026-04-15T12:00:00.000Z",
    rows: [
      {
        ai_response: {
          system_observability: {
            recentServiceCalls: [
              {
                fallbackUsed: false,
                latencyMs: 120,
                outcome: "success",
                recordedAt: "2026-04-15T08:00:00.000Z",
                service: "text-retrieval-service",
                shadowMode: false,
                stage: "search",
              },
              {
                fallbackUsed: false,
                latencyMs: 510,
                outcome: "timeout",
                recordedAt: "2026-04-15T08:10:00.000Z",
                service: "text-retrieval-service",
                shadowMode: false,
                stage: "search",
              },
              {
                fallbackUsed: false,
                latencyMs: 340,
                outcome: "error",
                recordedAt: "2026-04-15T09:00:00.000Z",
                service: "multimodal-consult-service",
                shadowMode: false,
                stage: "consult",
              },
            ],
            recentShadowComparisons: [
              {
                disagreementCount: 2,
                recordedAt: "2026-04-15T08:12:00.000Z",
                service: "text-retrieval-service",
                shadowStrategy: "bge",
                summary: "Ranking drift",
                usedStrategy: "lexical",
              },
              {
                disagreementCount: 0,
                recordedAt: "2026-04-15T09:05:00.000Z",
                service: "multimodal-consult-service",
                shadowStrategy: "shadow",
                summary: "Agreement",
                usedStrategy: "live",
              },
            ],
          },
          session: {
            case_memory: {
              service_observations: [
                {
                  note: "valid_json=true | ans=3",
                  outcome: "success",
                  recordedAt: "2026-04-15T07:55:00.000Z",
                  service: "async-review-service",
                  stage: "extraction",
                },
                {
                  note: "pending_before=true | pending_after=false",
                  outcome: "success",
                  recordedAt: "2026-04-15T07:56:00.000Z",
                  service: "async-review-service",
                  stage: "pending_recovery",
                },
                {
                  note: "repeat_prevented=true",
                  outcome: "success",
                  recordedAt: "2026-04-15T07:57:00.000Z",
                  service: "async-review-service",
                  stage: "repeat_suppression",
                },
              ],
            },
          },
        },
        created_at: "2026-04-15T08:15:00.000Z",
      },
      {
        ai_response: {
          session: {
            case_memory: {
              service_observations: [
                {
                  note: "valid_json=false | ans=0",
                  outcome: "success",
                  recordedAt: "2026-04-10T07:55:00.000Z",
                  service: "async-review-service",
                  stage: "extraction",
                },
                {
                  note: "pending_before=true | pending_after=true",
                  outcome: "needs_clarification",
                  recordedAt: "2026-04-10T07:56:00.000Z",
                  service: "async-review-service",
                  stage: "pending_recovery",
                },
              ],
            },
          },
        },
        created_at: "2026-04-10T08:15:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("admin telemetry helpers", () => {
  it("builds the requested production telemetry aggregates", () => {
    const payload = buildAdminTelemetryDashboardData(buildInput());
    const textRetrieval = payload.sidecars.find(
      (service) => service.service === "text-retrieval-service"
    );

    expect(payload.symptomCheckCount7d).toBe(2);
    expect(payload.pipeline.extractionSuccess.rate24h).toBe(1);
    expect(payload.pipeline.extractionSuccess.rate7d).toBe(0.5);
    expect(payload.pipeline.pendingQuestionRescue.rate24h).toBe(1);
    expect(payload.pipeline.pendingQuestionRescue.rate7d).toBe(0.5);
    expect(payload.pipeline.repeatQuestionAttempt.rate24h).toBe(1);
    expect(textRetrieval?.timeoutRate24h).toBe(0.5);
    expect(textRetrieval?.p95LatencyMs).toBe(510);
    expect(textRetrieval?.shadowDisagreementRate24h).toBe(1);
  });

  it("stays honest when pipeline telemetry is unavailable", () => {
    const payload = buildAdminTelemetryDashboardData(
      buildInput({
        rows: [
          {
            ai_response: {
              system_observability: {
                recentServiceCalls: [],
                recentShadowComparisons: [],
              },
            },
            created_at: "2026-04-15T12:00:00.000Z",
          },
        ],
      })
    );

    expect(payload.pipeline.extractionSuccess.availability).toBe("unavailable");
    expect(payload.notes.join(" ")).toContain("Extraction, pending-question rescue");
  });

  it("builds an unavailable payload instead of fake demo telemetry", () => {
    const payload = buildUnavailableAdminTelemetryDashboardData(
      "2026-04-15T12:00:00.000Z",
      "Supabase is not configured."
    );

    expect(payload.dataMode).toBe("unavailable");
    expect(payload.notes).toContain("Supabase is not configured.");
    expect(payload.pipeline.repeatQuestionAttempt.rate24h).toBeNull();
  });
});
