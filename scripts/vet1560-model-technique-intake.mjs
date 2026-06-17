import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const liveConfigPath = "../.agents/autoscientists/local.config.json";
const snapshotPath = "plans/VET-1560-model-technique-intake-snapshot.json";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readLiveConfig(cwd) {
  const absolutePath = resolve(cwd, liveConfigPath);
  if (!existsSync(absolutePath)) {
    return null;
  }

  const parsed = readJson(absolutePath);
  if (!parsed.modelTechniqueIntake) {
    throw new Error(`${liveConfigPath} is missing modelTechniqueIntake`);
  }

  return {
    intake: parsed.modelTechniqueIntake,
    source: {
      type: "live-local-config",
      path: liveConfigPath,
      exists: true,
      fallbackPath: snapshotPath,
    },
  };
}

function readSnapshot(cwd) {
  const absolutePath = resolve(cwd, snapshotPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`${snapshotPath} is missing`);
  }

  const parsed = readJson(absolutePath);
  if (!parsed.modelTechniqueIntake) {
    throw new Error(`${snapshotPath} is missing modelTechniqueIntake`);
  }

  return {
    intake: parsed.modelTechniqueIntake,
    source: {
      type: "committed-snapshot",
      path: snapshotPath,
      exists: true,
      liveConfigPath,
      liveConfigExists: false,
    },
  };
}

export function loadModelTechniqueIntake(cwd = process.cwd()) {
  return readLiveConfig(cwd) ?? readSnapshot(cwd);
}

export function requireModelTechniqueSource(intake, sourceId) {
  const source = intake.sources?.find((item) => item.id === sourceId);
  if (!source) {
    throw new Error(`${sourceId} source is missing from model technique intake`);
  }
  return source;
}
