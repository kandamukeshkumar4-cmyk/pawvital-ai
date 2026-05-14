import { readFileSync } from "node:fs";
import path from "node:path";

import {
  getFeatureModelRoute,
  getGrokFinalReportMode,
  getGrokFinalSafetyMode,
  getModelRouterVersion,
  getSecondOpinionExtractorMode,
} from "@/lib/model-router";

function parseEnvExample(): Record<string, string> {
  const raw = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  const values: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    values[trimmed.slice(0, separatorIndex)] = trimmed.slice(separatorIndex + 1);
  }

  return values;
}

describe("VET-1488 shadow model rollout config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.SECOND_OPINION_EXTRACTOR;
    delete process.env.GROK_FINAL_SAFETY;
    delete process.env.GROK_FINAL_REPORT;
    delete process.env.MODEL_ROUTER_VERSION;
    delete process.env.XAI_GROK_FINAL_SAFETY_MODEL;
    delete process.env.XAI_GROK_FINAL_REPORT_MODEL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("documents the shadow rollout flags as server-side defaults", () => {
    const values = parseEnvExample();

    expect(values.MODEL_ROUTER_VERSION).toBe("v1");
    expect(values.SECOND_OPINION_EXTRACTOR).toBe("off");
    expect(values.GROK_FINAL_SAFETY).toBe("off");
    expect(values.GROK_FINAL_REPORT).toBe("off");
  });

  it("documents xAI provider config without exposing a public key", () => {
    const raw = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
    const values = parseEnvExample();

    expect(values.XAI_API_KEY).toBe("");
    expect(values.GROK_API_KEY).toBe("");
    expect(values.XAI_BASE_URL).toBe("https://api.x.ai/v1");
    expect(values.XAI_GROK_FINAL_SAFETY_MODEL).toBe("grok-4.3");
    expect(values.XAI_GROK_FINAL_REPORT_MODEL).toBe("grok-4.3");
    expect(raw).not.toMatch(/NEXT_PUBLIC_XAI|NEXT_PUBLIC_GROK/);
  });

  it("parses the intended shadow rollout modes", () => {
    expect(getModelRouterVersion("v1")).toBe("v1");
    expect(getSecondOpinionExtractorMode("shadow")).toBe("shadow");
    expect(getGrokFinalSafetyMode("shadow")).toBe("shadow");
    expect(getGrokFinalReportMode("off")).toBe("off");
  });

  it("keeps feature defaults closed when rollout vars are absent", () => {
    expect(getSecondOpinionExtractorMode()).toBe("off");
    expect(getGrokFinalSafetyMode()).toBe("off");
    expect(getGrokFinalReportMode()).toBe("off");
  });

  it("routes final-safety shadow to the pinned Grok model override", () => {
    process.env.XAI_GROK_FINAL_SAFETY_MODEL = "grok-4.3";

    expect(getFeatureModelRoute("grok_final_safety")).toMatchObject({
      provider: "grok",
      primaryModel: "grok-4.3",
      timeoutMs: 12000,
    });
  });
});
