import fs from "node:fs";
import path from "node:path";
import sidecarServiceRegistry from "./sidecar-service-registry.json";
import type { SidecarServiceName } from "./clinical-evidence";
import {
  buildSidecarReadinessSnapshot,
  type SidecarConfigSummary,
  type SidecarHealthSummary,
  type SidecarReadinessSnapshot,
} from "./sidecar-readiness";
import {
  buildEmptyPersistedShadowBaselineSnapshot,
  buildPersistedShadowBaselineSnapshot,
  mergeServiceSummaryWithMetrics,
  type PersistedShadowBaselineSnapshot,
  type PersistedShadowServiceMetrics,
} from "./shadow-rollout-baseline";
import type { ShadowRolloutStatus } from "./shadow-rollout";

export const LIVE_SPLIT_VALUES = [0, 5, 10, 15, 20] as const;

export type LiveSplitPct = (typeof LIVE_SPLIT_VALUES)[number];
export type RolloutWriteMode = "live" | "preview";

interface SidecarRegistryEntry {
  name: SidecarServiceName;
  env: string;
  expectedPath: string;
  expectedHealthService: SidecarServiceName;
}

type ShadowServiceSummaryWithMetrics = ReturnType<
  typeof mergeServiceSummaryWithMetrics
>[number];

export interface AdminShadowRolloutServiceControl {
  service: SidecarServiceName;
  serviceLabel: string;
  liveSplitEnv: string;
  currentLiveSplitPct: LiveSplitPct;
  config: SidecarConfigSummary;
  health: SidecarHealthSummary;
  shadow: {
    blockers: string[];
    loadTestStatus: ShadowServiceSummaryWithMetrics["loadTestStatus"];
    metrics: PersistedShadowServiceMetrics;
    sampleMode: ShadowServiceSummaryWithMetrics["sampleMode"];
    shadowComparisonCount: number;
    shadowObservations: number;
    status: ShadowRolloutStatus;
    totalObservations: number;
    window: ShadowServiceSummaryWithMetrics["window"];
  };
  rollout: {
    blockedReason: string | null;
    canDecrease: boolean;
    canIncrease: boolean;
    canKillSwitch: boolean;
    promotedLive: boolean;
  };
}

export interface AdminShadowRolloutDashboardData {
  generatedAt: string;
  writeMode: RolloutWriteMode;
  writeReason: string | null;
  summary: {
    healthyServiceCount: number;
    promotedLiveCount: number;
    readyToPromoteCount: number;
    totalLiveSplitPct: number;
    totalServices: number;
  };
  readiness: Pick<
    SidecarReadinessSnapshot,
    | "configuredCount"
    | "generatedAt"
    | "healthyCount"
    | "misconfiguredCount"
    | "stubCount"
    | "unconfiguredCount"
    | "unhealthyCount"
    | "unreachableCount"
    | "validCount"
  >;
  shadow: {
    baseline: Pick<
      PersistedShadowBaselineSnapshot,
      | "generatedAt"
      | "malformedReportCount"
      | "observationCount"
      | "parsedReportCount"
      | "reportCount"
      | "shadowComparisonCount"
      | "warning"
      | "windowHours"
    >;
    blockers: string[];
    gateConfig: PersistedShadowBaselineSnapshot["summary"]["gateConfig"];
    overallStatus: PersistedShadowBaselineSnapshot["summary"]["overallStatus"];
    shadowModeDataPresent: boolean;
  };
  services: AdminShadowRolloutServiceControl[];
}

export interface LiveSplitChangeEvaluation {
  allowed: boolean;
  mode: "increase" | "decrease" | "kill_switch" | "no_change";
  reason: string;
}

export interface UpdateShadowRolloutControlResult {
  ok: true;
  control: AdminShadowRolloutServiceControl;
  deployment: {
    id: string | null;
    url: string | null;
  } | null;
  liveSplitPct: LiveSplitPct;
  message: string;
  mode: RolloutWriteMode;
}

export interface UpdateShadowRolloutControlFailure {
  error: string;
  ok: false;
  status: number;
}

const registry = sidecarServiceRegistry as SidecarRegistryEntry[];
const DEFAULT_PROJECT_NAME = "pawvital-ai";

function serviceLabel(service: SidecarServiceName) {
  return service
    .replace(/-service$/, "")
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function serviceToLiveSplitEnv(service: SidecarServiceName) {
  const suffix = service.replace(/-service$/, "").replace(/-/g, "_").toUpperCase();
  return `SIDECAR_LIVE_SPLIT_${suffix}`;
}

function parseLiveSplitPct(value: unknown): LiveSplitPct {
  const numeric =
    typeof value === "number" ? value : Number.parseInt(String(value || "0"), 10);
  return LIVE_SPLIT_VALUES.includes(numeric as LiveSplitPct)
    ? (numeric as LiveSplitPct)
    : 0;
}

function isValidLiveSplitPct(value: unknown): value is LiveSplitPct {
  return LIVE_SPLIT_VALUES.includes(Number(value) as LiveSplitPct);
}

function readProjectConfigFromDisk() {
  const projectPath = path.join(process.cwd(), ".vercel", "project.json");
  if (!fs.existsSync(projectPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(projectPath, "utf8")) as {
      orgId?: string;
      projectId?: string;
    };
    return {
      projectId: String(parsed.projectId || "").trim(),
      teamId: String(parsed.orgId || "").trim(),
    };
  } catch {
    return null;
  }
}

function getVercelProjectConfig() {
  const projectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
  const teamId = String(
    process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || ""
  ).trim();

  if (projectId) {
    return { projectId, teamId };
  }

  return readProjectConfigFromDisk();
}

function getWriteMode() {
  if (process.env.VERCEL_ENV !== "production") {
    return {
      reason:
        "Write controls stay in preview mode outside production deployments.",
      writeMode: "preview" as const,
    };
  }

  if (!process.env.VERCEL_TOKEN) {
    return {
      reason:
        "VERCEL_TOKEN is missing, so rollout changes are preview-only in this environment.",
      writeMode: "preview" as const,
    };
  }

  if (!getVercelProjectConfig()?.projectId) {
    return {
      reason:
        "Vercel project metadata is missing, so rollout changes are preview-only.",
      writeMode: "preview" as const,
    };
  }

  return {
    reason:
      "Live split updates write the production env var and queue a production redeploy.",
    writeMode: "live" as const,
  };
}

function buildIncreaseBlocker(input: {
  config: SidecarConfigSummary;
  health: SidecarHealthSummary;
  shadow: ShadowServiceSummaryWithMetrics;
}): string | null {
  if (!input.config.configured) {
    return `${input.config.env} is not configured.`;
  }

  if (!input.config.valid) {
    return input.config.warning || `${input.config.env} is invalid.`;
  }

  if (input.health.status !== "healthy") {
    return `Health status is ${input.health.status}; only healthy services can increase live traffic.`;
  }

  if (input.shadow.status !== "ready") {
    return `Shadow rollout gate is ${input.shadow.status}; increases stay blocked until the gate is ready.`;
  }

  return null;
}

export function buildServiceShadowRolloutControl(input: {
  config: SidecarConfigSummary;
  currentLiveSplitPct: LiveSplitPct;
  health: SidecarHealthSummary;
  shadow: ShadowServiceSummaryWithMetrics;
}): AdminShadowRolloutServiceControl {
  const blockedReason = buildIncreaseBlocker(input);

  return {
    service: input.shadow.service,
    serviceLabel: serviceLabel(input.shadow.service),
    liveSplitEnv: serviceToLiveSplitEnv(input.shadow.service),
    currentLiveSplitPct: input.currentLiveSplitPct,
    config: input.config,
    health: input.health,
    shadow: {
      blockers: input.shadow.blockers,
      loadTestStatus: input.shadow.loadTestStatus,
      metrics: input.shadow.metrics,
      sampleMode: input.shadow.sampleMode,
      shadowComparisonCount: input.shadow.shadowComparisonCount,
      shadowObservations: input.shadow.shadowObservations,
      status: input.shadow.status,
      totalObservations: input.shadow.totalObservations,
      window: input.shadow.window,
    },
    rollout: {
      blockedReason,
      canDecrease: input.currentLiveSplitPct > 0,
      canIncrease:
        input.currentLiveSplitPct < LIVE_SPLIT_VALUES[LIVE_SPLIT_VALUES.length - 1] &&
        blockedReason === null,
      canKillSwitch: input.currentLiveSplitPct > 0,
      promotedLive: input.currentLiveSplitPct > 0,
    },
  };
}

export function evaluateLiveSplitChange(
  control: AdminShadowRolloutServiceControl,
  nextLiveSplitPct: LiveSplitPct
): LiveSplitChangeEvaluation {
  if (nextLiveSplitPct === control.currentLiveSplitPct) {
    return {
      allowed: true,
      mode: "no_change",
      reason: "Requested live split already matches the current deployment.",
    };
  }

  if (nextLiveSplitPct === 0 && control.currentLiveSplitPct > 0) {
    return {
      allowed: true,
      mode: "kill_switch",
      reason:
        "Kill switch requested. Reducing live traffic to 0% is always allowed.",
    };
  }

  if (nextLiveSplitPct < control.currentLiveSplitPct) {
    return {
      allowed: true,
      mode: "decrease",
      reason:
        "Exposure reduction is allowed immediately because it lowers live risk.",
    };
  }

  if (control.rollout.blockedReason) {
    return {
      allowed: false,
      mode: "increase",
      reason: control.rollout.blockedReason,
    };
  }

  return {
    allowed: true,
    mode: "increase",
    reason:
      "Shadow rollout and health gates are satisfied, so increasing live split is allowed.",
  };
}

async function loadPersistedBaseline() {
  try {
    return await buildPersistedShadowBaselineSnapshot();
  } catch (error) {
    return buildEmptyPersistedShadowBaselineSnapshot(
      error instanceof Error
        ? error.message
        : "Unable to load persisted shadow baseline.",
      24
    );
  }
}

function getCurrentLiveSplitByService() {
  return Object.fromEntries(
    registry.map((entry) => [
      entry.name,
      parseLiveSplitPct(process.env[serviceToLiveSplitEnv(entry.name)]),
    ])
  ) as Record<SidecarServiceName, LiveSplitPct>;
}

async function updateProductionEnvValue(input: {
  key: string;
  value: string;
  targets: string[];
}) {
  const token = String(process.env.VERCEL_TOKEN || "").trim();
  const projectConfig = getVercelProjectConfig();

  if (!token || !projectConfig?.projectId) {
    throw new Error("Vercel API credentials are not configured.");
  }

  const params = new URLSearchParams();
  if (projectConfig.teamId) {
    params.set("teamId", projectConfig.teamId);
  }

  const baseUrl =
    `https://api.vercel.com/v10/projects/${projectConfig.projectId}/env` +
    (params.toString() ? `?${params}` : "");
  const listResponse = await fetch(baseUrl, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    method: "GET",
  });
  const listText = await listResponse.text();
  const listBody = listText ? (JSON.parse(listText) as { envs?: unknown[] }) : null;

  if (!listResponse.ok || !Array.isArray(listBody?.envs)) {
    throw new Error(
      `Unable to load Vercel env metadata (${listResponse.status}).`
    );
  }

  const existing = listBody.envs.find((env) => {
    if (!env || typeof env !== "object") return false;
    const candidate = env as {
      id?: string;
      key?: string;
      target?: string[];
    };
    return candidate.key === input.key && candidate.target?.includes("production");
  }) as { id?: string } | undefined;

  if (existing?.id) {
    const patchUrl =
      `https://api.vercel.com/v10/projects/${projectConfig.projectId}/env/${existing.id}` +
      (params.toString() ? `?${params}` : "");
    const patchResponse = await fetch(patchUrl, {
      body: JSON.stringify({
        target: input.targets,
        type: "encrypted",
        value: input.value,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });
    if (!patchResponse.ok) {
      throw new Error(
        `Unable to update ${input.key} (${patchResponse.status}).`
      );
    }
    return;
  }

  const createResponse = await fetch(baseUrl, {
    body: JSON.stringify({
      key: input.key,
      target: input.targets,
      type: "encrypted",
      value: input.value,
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  if (!createResponse.ok) {
    throw new Error(`Unable to create ${input.key} (${createResponse.status}).`);
  }
}

async function getVercelTeamContext(token: string) {
  const userResponse = await fetch("https://api.vercel.com/v2/user", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    method: "GET",
  });
  const userText = await userResponse.text();
  if (!userResponse.ok) {
    throw new Error(`Unable to read Vercel user info (${userResponse.status}).`);
  }

  const userBody = userText
    ? (JSON.parse(userText) as {
        user?: { defaultTeamId?: string };
      })
    : null;
  const teamId =
    String(
      process.env.VERCEL_TEAM_ID ||
        process.env.VERCEL_ORG_ID ||
        userBody?.user?.defaultTeamId ||
        ""
    ).trim() || null;

  if (!teamId) {
    return { teamId: null, teamSlug: null };
  }

  const teamResponse = await fetch(`https://api.vercel.com/v2/teams/${teamId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    method: "GET",
  });
  const teamText = await teamResponse.text();
  if (!teamResponse.ok) {
    throw new Error(`Unable to read Vercel team info (${teamResponse.status}).`);
  }

  const teamBody = teamText ? (JSON.parse(teamText) as { slug?: string }) : null;
  return {
    teamId,
    teamSlug: String(teamBody?.slug || "").trim() || null,
  };
}

async function fetchLatestProductionDeployment(token: string) {
  const projectConfig = getVercelProjectConfig();
  const teamId = String(
    process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || projectConfig?.teamId || ""
  ).trim();
  const projectId = String(projectConfig?.projectId || "").trim();
  if (!projectId) {
    throw new Error("Vercel project id is missing.");
  }

  const query = new URLSearchParams({
    limit: "5",
    projectId,
    target: "production",
  });
  if (teamId) {
    query.set("teamId", teamId);
  }

  const response = await fetch(
    `https://api.vercel.com/v6/deployments?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      method: "GET",
    }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Unable to load production deployment metadata (${response.status}).`
    );
  }

  const body = text
    ? (JSON.parse(text) as {
        deployments?: Array<{
          name?: string;
          uid?: string;
        }>;
      })
    : null;
  return body?.deployments?.[0] || null;
}

async function queueProductionRedeploy() {
  const token = String(process.env.VERCEL_TOKEN || "").trim();
  if (!token) {
    return null;
  }

  const latestDeployment = await fetchLatestProductionDeployment(token);
  if (!latestDeployment?.uid) {
    return null;
  }

  const { teamId, teamSlug } = await getVercelTeamContext(token);
  if (!teamId || !teamSlug) {
    return null;
  }

  const response = await fetch(
    `https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(
      teamId
    )}&slug=${encodeURIComponent(teamSlug)}`,
    {
      body: JSON.stringify({
        deploymentId: latestDeployment.uid,
        name: latestDeployment.name || DEFAULT_PROJECT_NAME,
        project: latestDeployment.name || DEFAULT_PROJECT_NAME,
        target: "production",
        withLatestCommit: true,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  );
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Unable to queue production redeploy (${response.status}).`);
  }

  const body = text
    ? (JSON.parse(text) as {
        id?: string;
        inspectorUrl?: string;
        url?: string;
      })
    : null;

  return {
    id: String(body?.id || "").trim() || null,
    url:
      String(body?.inspectorUrl || body?.url || "").trim() || null,
  };
}

export async function buildAdminShadowRolloutDashboardData(): Promise<AdminShadowRolloutDashboardData> {
  const [readiness, baseline] = await Promise.all([
    buildSidecarReadinessSnapshot(),
    loadPersistedBaseline(),
  ]);

  const writeState = getWriteMode();
  const currentLiveSplits = getCurrentLiveSplitByService();
  const shadowServices = mergeServiceSummaryWithMetrics(
    baseline.summary.services,
    baseline.serviceMetrics
  );

  const configByService = new Map(
    readiness.configs.map((config) => [config.service, config])
  );
  const healthByService = new Map(
    readiness.health.map((health) => [health.service, health])
  );
  const services = shadowServices.map((shadow) =>
    buildServiceShadowRolloutControl({
      config:
        configByService.get(shadow.service) ||
        ({
          configured: false,
          env: registry.find((entry) => entry.name === shadow.service)?.env || "",
          expectedPath:
            registry.find((entry) => entry.name === shadow.service)?.expectedPath ||
            "",
          service: shadow.service,
          url: null,
          valid: false,
          warning: "Service registry entry is missing.",
        } satisfies SidecarConfigSummary),
      currentLiveSplitPct: currentLiveSplits[shadow.service] || 0,
      health:
        healthByService.get(shadow.service) ||
        ({
          detail: "Health metadata unavailable.",
          mode: null,
          model: null,
          service: shadow.service,
          status: "unconfigured",
          statusCode: null,
        } satisfies SidecarHealthSummary),
      shadow,
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    writeMode: writeState.writeMode,
    writeReason: writeState.reason,
    summary: {
      healthyServiceCount: services.filter(
        (service) => service.health.status === "healthy"
      ).length,
      promotedLiveCount: services.filter(
        (service) => service.rollout.promotedLive
      ).length,
      readyToPromoteCount: services.filter(
        (service) =>
          !service.rollout.promotedLive && service.rollout.blockedReason === null
      ).length,
      totalLiveSplitPct: services.reduce(
        (sum, service) => sum + service.currentLiveSplitPct,
        0
      ),
      totalServices: services.length,
    },
    readiness: {
      configuredCount: readiness.configuredCount,
      generatedAt: readiness.generatedAt,
      healthyCount: readiness.healthyCount,
      misconfiguredCount: readiness.misconfiguredCount,
      stubCount: readiness.stubCount,
      unconfiguredCount: readiness.unconfiguredCount,
      unhealthyCount: readiness.unhealthyCount,
      unreachableCount: readiness.unreachableCount,
      validCount: readiness.validCount,
    },
    shadow: {
      baseline: {
        generatedAt: baseline.generatedAt,
        malformedReportCount: baseline.malformedReportCount,
        observationCount: baseline.observationCount,
        parsedReportCount: baseline.parsedReportCount,
        reportCount: baseline.reportCount,
        shadowComparisonCount: baseline.shadowComparisonCount,
        warning: baseline.warning,
        windowHours: baseline.windowHours,
      },
      blockers: baseline.summary.blockers,
      gateConfig: baseline.summary.gateConfig,
      overallStatus: baseline.summary.overallStatus,
      shadowModeDataPresent: baseline.summary.shadowModeDataPresent,
    },
    services,
  };
}

export async function updateAdminShadowRolloutControl(input: {
  liveSplitPct: number;
  service: string;
}): Promise<UpdateShadowRolloutControlResult | UpdateShadowRolloutControlFailure> {
  const service = registry.find((entry) => entry.name === input.service);
  if (!service) {
    return {
      error: "Unsupported sidecar service.",
      ok: false,
      status: 404,
    };
  }

  if (!isValidLiveSplitPct(input.liveSplitPct)) {
    return {
      error: "liveSplitPct must be one of 0, 5, 10, 15, or 20.",
      ok: false,
      status: 400,
    };
  }

  const dashboard = await buildAdminShadowRolloutDashboardData();
  const control = dashboard.services.find((entry) => entry.service === service.name);
  if (!control) {
    return {
      error: "Shadow rollout control record is unavailable for that service.",
      ok: false,
      status: 404,
    };
  }

  const nextLiveSplitPct = input.liveSplitPct as LiveSplitPct;
  const evaluation = evaluateLiveSplitChange(control, nextLiveSplitPct);
  if (!evaluation.allowed) {
    return {
      error: evaluation.reason,
      ok: false,
      status: 409,
    };
  }

  const nextControl = {
    ...control,
    currentLiveSplitPct: nextLiveSplitPct,
    rollout: {
      ...control.rollout,
      canDecrease: nextLiveSplitPct > 0,
      canKillSwitch: nextLiveSplitPct > 0,
      promotedLive: nextLiveSplitPct > 0,
    },
  };

  if (dashboard.writeMode !== "live") {
    return {
      control: nextControl,
      deployment: null,
      liveSplitPct: nextLiveSplitPct,
      message:
        `${evaluation.reason} Preview mode only: no production envs were changed. ` +
        `${dashboard.writeReason || ""}`.trim(),
      mode: dashboard.writeMode,
      ok: true,
    };
  }

  try {
    await updateProductionEnvValue({
      key: control.liveSplitEnv,
      targets: ["production"],
      value: String(nextLiveSplitPct),
    });
    const deployment = await queueProductionRedeploy();

    return {
      control: nextControl,
      deployment,
      liveSplitPct: nextLiveSplitPct,
      message:
        `${evaluation.reason} Saved ${control.liveSplitEnv}=${nextLiveSplitPct} and queued a production redeploy.`,
      mode: "live",
      ok: true,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update the live split control.",
      ok: false,
      status: 500,
    };
  }
}

export function buildDemoShadowRolloutDashboardData(): AdminShadowRolloutDashboardData {
  const baseline = buildEmptyPersistedShadowBaselineSnapshot(
    "Demo mode: persisted shadow telemetry is simulated."
  );
  const services = registry.map((entry, index) =>
    buildServiceShadowRolloutControl({
      config: {
        configured: true,
        env: entry.env,
        expectedPath: entry.expectedPath,
        service: entry.name,
        url: `https://demo-sidecar-${index + 1}.pawvital.ai${entry.expectedPath}`,
        valid: true,
        warning: null,
      },
      currentLiveSplitPct:
        entry.name === "text-retrieval-service"
          ? 10
          : entry.name === "image-retrieval-service"
            ? 5
            : 0,
      health: {
        detail: null,
        mode: "real",
        model: "demo",
        service: entry.name,
        status: "healthy",
        statusCode: 200,
      },
      shadow: {
        ...mergeServiceSummaryWithMetrics(
          baseline.summary.services,
          baseline.serviceMetrics
        ).find((service) => service.service === entry.name)!,
        blockers:
          entry.name === "multimodal-consult-service"
            ? ["Synthetic load-test evidence is still required before promotion."]
            : [],
        metrics: {
          comparisonCount: entry.name === "text-retrieval-service" ? 18 : 12,
          disagreementComparisonCount: entry.name === "multimodal-consult-service" ? 2 : 0,
          disagreementRate: entry.name === "multimodal-consult-service" ? 0.11 : 0,
          errorRate: 0,
          fallbackRate: entry.name === "image-retrieval-service" ? 0.05 : 0,
          observationCount: entry.name === "async-review-service" ? 24 : 32,
          p95LatencyMs: entry.name === "async-review-service" ? 1480 : 430,
          service: entry.name,
          shadowObservationCount: entry.name === "async-review-service" ? 24 : 32,
          successfulObservationCount: entry.name === "async-review-service" ? 24 : 32,
          timeoutRate: 0,
        },
        sampleMode: "shadow",
        shadowComparisonCount: entry.name === "async-review-service" ? 8 : 12,
        shadowObservations: entry.name === "async-review-service" ? 24 : 32,
        status:
          entry.name === "multimodal-consult-service" ? "watch" : "ready",
        totalObservations: entry.name === "async-review-service" ? 24 : 32,
        window: {
          healthySampleRatio: 1,
          observedHealthySamples: entry.name === "async-review-service" ? 24 : 32,
          observedWindowSamples: entry.name === "async-review-service" ? 24 : 32,
          requiredHealthyRatio: baseline.summary.gateConfig.requiredHealthyRatio,
          requiredHealthySamples: baseline.summary.gateConfig.requiredHealthySamples,
          sampleIntervalMinutes: baseline.summary.gateConfig.sampleIntervalMinutes,
          windowHours: baseline.summary.gateConfig.windowHours,
        },
      },
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    writeMode: "preview",
    writeReason:
      "Demo mode: rollout controls preview the change but do not touch production envs.",
    summary: {
      healthyServiceCount: services.length,
      promotedLiveCount: services.filter((service) => service.rollout.promotedLive)
        .length,
      readyToPromoteCount: services.filter(
        (service) =>
          !service.rollout.promotedLive && service.rollout.blockedReason === null
      ).length,
      totalLiveSplitPct: services.reduce(
        (sum, service) => sum + service.currentLiveSplitPct,
        0
      ),
      totalServices: services.length,
    },
    readiness: {
      configuredCount: services.length,
      generatedAt: new Date().toISOString(),
      healthyCount: services.length,
      misconfiguredCount: 0,
      stubCount: 0,
      unconfiguredCount: 0,
      unhealthyCount: 0,
      unreachableCount: 0,
      validCount: services.length,
    },
    shadow: {
      baseline: {
        generatedAt: baseline.generatedAt,
        malformedReportCount: 0,
        observationCount: 144,
        parsedReportCount: 42,
        reportCount: 42,
        shadowComparisonCount: 52,
        warning: baseline.warning,
        windowHours: baseline.windowHours,
      },
      blockers: [
        "multimodal-consult-service: Synthetic load test evidence is still required before promotion.",
      ],
      gateConfig: baseline.summary.gateConfig,
      overallStatus: "watch",
      shadowModeDataPresent: true,
    },
    services,
  };
}
