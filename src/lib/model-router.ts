const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export type ModelProvider = "nvidia" | "narrow-pack" | "grok";
export type ModelFeatureMode = "off" | "shadow" | "on";

export const MODEL_FALLBACK_REASONS = [
  "budget_exceeded",
  "timeout",
  "provider_error",
  "malformed_json",
  "feature_disabled",
  "circuit_open",
] as const;

export type ModelFallbackReason = (typeof MODEL_FALLBACK_REASONS)[number];

export const MODELS = {
  extraction: {
    name: "qwen/qwen3.5-122b-a10b",
    fallback: "qwen/qwen3.5-397b-a17b",
    role: "Data Extraction" as const,
  },
  phrasing: {
    name: "meta/llama-3.3-70b-instruct",
    fallback: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    role: "Question Phrasing" as const,
  },
  phrasing_verifier: {
    name: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    fallback: "meta/llama-3.3-70b-instruct",
    role: "Question Verification" as const,
  },
  diagnosis: {
    name: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    fallback: "deepseek-ai/deepseek-v3.2",
    role: "Diagnosis Report" as const,
  },
  safety: {
    name: "z-ai/glm5",
    fallback: null,
    role: "Safety Verification" as const,
  },
  vision_fast: {
    name: "meta/llama-3.2-11b-vision-instruct",
    fallback: "meta/llama-4-maverick-17b-128e-instruct",
    role: "Fast Triage" as const,
  },
  vision_detailed: {
    name: "meta/llama-3.2-90b-vision-instruct",
    fallback: "meta/llama-4-maverick-17b-128e-instruct",
    role: "Detailed Analysis" as const,
  },
  vision_deep: {
    name: "moonshotai/kimi-k2.5",
    fallback: null,
    role: "Deep Reasoning" as const,
  },
} as const;

export type ModelRole = keyof typeof MODELS;
type TextModelRole = Exclude<
  ModelRole,
  "vision_fast" | "vision_detailed" | "vision_deep"
>;

export type ModelFeature =
  | "second_opinion"
  | "grok_final_safety"
  | "grok_final_report";

interface ModelRoleRuntimeSettings {
  concurrencyLimit?: number;
  providers: readonly ModelProvider[];
  timeoutMs: number;
}

interface ModelFeatureRuntimeSettings {
  defaultMode: ModelFeatureMode;
  envName: string;
  maxCallsPerSession: number;
  timeoutMs: number;
}

const ROLE_ENV_PRIORITY: Record<ModelRole, readonly string[]> = {
  extraction: ["NVIDIA_QWEN_API_KEY", "NVIDIA_API_KEY"],
  phrasing: ["NVIDIA_API_KEY"],
  phrasing_verifier: ["NVIDIA_API_KEY"],
  diagnosis: ["NVIDIA_DEEPSEEK_API_KEY", "NVIDIA_API_KEY"],
  safety: ["NVIDIA_GLM_API_KEY", "NVIDIA_API_KEY"],
  vision_fast: ["NVIDIA_API_KEY"],
  vision_detailed: ["NVIDIA_API_KEY"],
  vision_deep: ["NVIDIA_KIMI_API_KEY", "NVIDIA_API_KEY"],
};

const ROLE_RUNTIME_SETTINGS: Record<ModelRole, ModelRoleRuntimeSettings> = {
  extraction: {
    concurrencyLimit: 2,
    providers: ["narrow-pack", "nvidia"],
    timeoutMs: 45000,
  },
  phrasing: {
    providers: ["narrow-pack", "nvidia"],
    timeoutMs: 12000,
  },
  phrasing_verifier: {
    concurrencyLimit: 1,
    providers: ["nvidia"],
    timeoutMs: 20000,
  },
  diagnosis: {
    concurrencyLimit: 1,
    providers: ["narrow-pack", "nvidia"],
    timeoutMs: 150000,
  },
  safety: {
    providers: ["narrow-pack", "nvidia"],
    timeoutMs: 30000,
  },
  vision_fast: {
    providers: ["nvidia"],
    timeoutMs: 30000,
  },
  vision_detailed: {
    concurrencyLimit: 1,
    providers: ["nvidia"],
    timeoutMs: 90000,
  },
  vision_deep: {
    concurrencyLimit: 1,
    providers: ["nvidia"],
    timeoutMs: 45000,
  },
};

const FEATURE_RUNTIME_SETTINGS: Record<ModelFeature, ModelFeatureRuntimeSettings> = {
  second_opinion: {
    defaultMode: "off",
    envName: "SECOND_OPINION_EXTRACTOR",
    maxCallsPerSession: 2,
    timeoutMs: 8000,
  },
  grok_final_safety: {
    defaultMode: "off",
    envName: "GROK_FINAL_SAFETY",
    maxCallsPerSession: 0,
    timeoutMs: 12000,
  },
  grok_final_report: {
    defaultMode: "off",
    envName: "GROK_FINAL_REPORT",
    maxCallsPerSession: 0,
    timeoutMs: 20000,
  },
};

const REQUIRED_TEXT_ROLES: TextModelRole[] = [
  "extraction",
  "phrasing",
  "diagnosis",
  "safety",
];

const NARROW_PACK_ROLES = new Set<TextModelRole>([
  "extraction",
  "phrasing",
  "diagnosis",
  "safety",
]);

function readEnvKey(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value || isLikelyPlaceholderKey(value)) {
    return null;
  }
  return value;
}

function normalizeFeatureMode(rawValue: string | undefined): ModelFeatureMode {
  const normalized = rawValue?.trim().toLowerCase();
  if (normalized === "shadow" || normalized === "on") {
    return normalized;
  }
  return "off";
}

function isNarrowPackRole(role: ModelRole): role is TextModelRole {
  return NARROW_PACK_ROLES.has(role as TextModelRole);
}

function isNarrowPackEnabledFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return !["0", "false", "no", "off"].includes(normalized);
}

export function isLikelyPlaceholderKey(key: string): boolean {
  const normalized = key.trim();
  if (!normalized) {
    return true;
  }

  return (
    normalized === "placeholder" ||
    normalized === "replace-me" ||
    normalized === "nvapi-REPLACE_WITH_YOUR_REAL_NVIDIA_NIM_KEY" ||
    normalized.startsWith("your_") ||
    /replace[_-]?with/i.test(normalized)
  );
}

export function getModelRouterVersion(rawValue = process.env.MODEL_ROUTER_VERSION): "v1" {
  return rawValue?.trim().toLowerCase() === "v1" ? "v1" : "v1";
}

export function getFeatureMode(
  feature: ModelFeature,
  rawValue = process.env[FEATURE_RUNTIME_SETTINGS[feature].envName]
): ModelFeatureMode {
  return normalizeFeatureMode(rawValue);
}

export function getSecondOpinionExtractorMode(
  rawValue = process.env.SECOND_OPINION_EXTRACTOR
): ModelFeatureMode {
  return getFeatureMode("second_opinion", rawValue);
}

export function getGrokFinalSafetyMode(
  rawValue = process.env.GROK_FINAL_SAFETY
): ModelFeatureMode {
  return getFeatureMode("grok_final_safety", rawValue);
}

export function getGrokFinalReportMode(
  rawValue = process.env.GROK_FINAL_REPORT
): ModelFeatureMode {
  return getFeatureMode("grok_final_report", rawValue);
}

export function getModelFeatureConfig(feature: ModelFeature) {
  return FEATURE_RUNTIME_SETTINGS[feature];
}

export function resolveNvidiaApiKey(role: ModelRole): string | null {
  for (const envName of ROLE_ENV_PRIORITY[role]) {
    const value = readEnvKey(envName);
    if (value) {
      return value;
    }
  }

  return null;
}

export function getNarrowPackRuntimeConfig(): {
  apiKey: string;
  baseURL: string;
} | null {
  if (!isNarrowPackEnabledFlag(process.env.NARROW_PACK_ENABLED)) {
    return null;
  }

  const baseURL = readEnvKey("HF_NARROW_MODEL_PACK_URL");
  const apiKey = readEnvKey("HF_SIDECAR_API_KEY");
  if (!baseURL || !apiKey) {
    return null;
  }

  return {
    apiKey,
    baseURL: baseURL.replace(/\/+$/, ""),
  };
}

export function getNvidiaRuntimeConfig(role: ModelRole): {
  apiKey: string;
  baseURL: string;
} | null {
  const apiKey = resolveNvidiaApiKey(role);
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseURL: NVIDIA_BASE_URL,
  };
}

export function isNvidiaRoleConfigured(role: ModelRole): boolean {
  return getNvidiaRuntimeConfig(role) !== null;
}

export function isNarrowPackConfigured(): boolean {
  return getNarrowPackRuntimeConfig() !== null;
}

export function getModelRoute(role: ModelRole) {
  const runtime = ROLE_RUNTIME_SETTINGS[role];
  return {
    concurrencyLimit: runtime.concurrencyLimit ?? null,
    fallbackModel: MODELS[role].fallback,
    primaryModel: MODELS[role].name,
    providers: runtime.providers,
    roleLabel: MODELS[role].role,
    timeoutMs: runtime.timeoutMs,
  };
}

export function getModelsToTry(
  role: ModelRole,
  provider: ModelProvider
): string[] {
  if (provider === "narrow-pack") {
    return [MODELS[role].name];
  }

  const modelsToTry: string[] = [MODELS[role].name];
  if (MODELS[role].fallback) {
    modelsToTry.push(MODELS[role].fallback);
  }
  return modelsToTry;
}

export function getRoleTimeoutMs(role: ModelRole): number {
  return ROLE_RUNTIME_SETTINGS[role].timeoutMs;
}

export function getRoleConcurrencyLimit(role: ModelRole): number | null {
  return ROLE_RUNTIME_SETTINGS[role].concurrencyLimit ?? null;
}

export function getProviderLabel(provider: ModelProvider): string {
  if (provider === "narrow-pack") {
    return "RunPod Narrow Pack";
  }
  if (provider === "grok") {
    return "Grok";
  }
  return "NVIDIA";
}

export function getModelProviderChain(role: ModelRole): ModelProvider[] {
  const configuredProviders: ModelProvider[] = [];

  for (const provider of ROLE_RUNTIME_SETTINGS[role].providers) {
    if (provider === "nvidia" && isNvidiaRoleConfigured(role)) {
      configuredProviders.push("nvidia");
      continue;
    }

    if (
      provider === "narrow-pack" &&
      isNarrowPackRole(role) &&
      isNarrowPackConfigured()
    ) {
      configuredProviders.push("narrow-pack");
    }
  }

  return configuredProviders;
}

export function isVisionPipelineConfigured(): boolean {
  return isNvidiaRoleConfigured("vision_fast");
}

export function isNvidiaConfigured(): boolean {
  return REQUIRED_TEXT_ROLES.every(
    (role) => getModelProviderChain(role).length > 0
  );
}
