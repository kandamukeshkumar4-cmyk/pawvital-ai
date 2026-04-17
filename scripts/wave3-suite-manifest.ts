import fs from "node:fs";
import path from "node:path";

import {
  buildWave3CanonicalManifestFromLegacy,
  type Wave3CanonicalManifest,
  type Wave3CaseRecord,
  type Wave3LegacyFreezeManifest,
  type Wave3ModalitySummary,
  validateWave3CanonicalManifest,
} from "../src/lib/wave3-release-gate.ts";

export interface Wave3BenchmarkCase extends Wave3CaseRecord {
  description: string;
  request?: {
    pet?: {
      species?: string;
    };
    messages?: Array<{
      role?: string;
      content?: string;
    }>;
  };
  expectations?: Record<string, unknown>;
  uncertainty_pattern?: string;
  wave3_adjudication?: {
    reviewer_slots?: Array<{
      role?: string;
      reviewer_id?: string;
      status?: string;
    }>;
    must_ask_expectations?: {
      status?: string;
    };
  };
}

interface Wave3SuiteFile {
  suite_id: string;
  species: string;
  cases: Wave3BenchmarkCase[];
}

export interface Wave3CanonicalBundle {
  manifest: Wave3CanonicalManifest;
  cases: Wave3BenchmarkCase[];
  modalities: Wave3ModalitySummary[];
  benchmarkDir: string;
  wave3Dir: string;
}

const BENCHMARK_DIR_PARTS = ["data", "benchmarks", "dog-triage"];
const LEGACY_MANIFEST_NAME = "wave3-freeze-manifest.json";
const CANONICAL_MANIFEST_NAME = "wave3-canonical-suite.json";

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function normalizeIdList(ids: string[]): string[] {
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function benchmarkDirFromRoot(rootDir: string): string {
  return path.join(rootDir, ...BENCHMARK_DIR_PARTS);
}

function buildWave3CaseMap(
  benchmarkDir: string,
  legacyManifest: Wave3LegacyFreezeManifest
): Map<string, Wave3BenchmarkCase> {
  const wave3Dir = path.join(benchmarkDir, "wave3-freeze");
  const caseMap = new Map<string, Wave3BenchmarkCase>();

  for (const stratum of legacyManifest.strata) {
    const shardPath = path.join(wave3Dir, stratum.fileName);
    if (!fs.existsSync(shardPath)) {
      throw new Error(`Wave 3 shard path is stale: ${shardPath}`);
    }

    const suite = readJson<Wave3SuiteFile>(shardPath);
    if (suite.species !== "dog") {
      throw new Error(`Wave 3 shard is not dog-only: ${shardPath}`);
    }

    for (const caseRecord of suite.cases) {
      if (!caseMap.has(caseRecord.id)) {
        caseMap.set(caseRecord.id, caseRecord);
      }
    }
  }

  return caseMap;
}

function validateManifestMembership(
  manifest: Wave3CanonicalManifest,
  caseMap: Map<string, Wave3BenchmarkCase>
): Wave3BenchmarkCase[] {
  const manifestCaseIdSet = new Set(manifest.caseIds);
  const extraCaseIds = normalizeIdList(
    [...caseMap.keys()].filter((caseId) => !manifestCaseIdSet.has(caseId))
  );
  if (extraCaseIds.length > 0) {
    throw new Error(
      `Wave 3 canonical manifest excludes shard case IDs: ${extraCaseIds.join(", ")}`
    );
  }

  const missingCaseIds = normalizeIdList(
    manifest.caseIds.filter((caseId) => !caseMap.has(caseId))
  );
  if (missingCaseIds.length > 0) {
    throw new Error(
      `Wave 3 canonical manifest references missing shard case IDs: ${missingCaseIds.join(", ")}`
    );
  }

  return manifest.caseIds.map((caseId) => {
    const caseRecord = caseMap.get(caseId);
    if (!caseRecord) {
      throw new Error(`Wave 3 canonical manifest is missing shard case ${caseId}.`);
    }
    return caseRecord;
  });
}

export function loadWave3CanonicalBundle(rootDir: string): Wave3CanonicalBundle {
  const benchmarkDir = benchmarkDirFromRoot(rootDir);
  const wave3Dir = path.join(benchmarkDir, "wave3-freeze");
  const legacyManifestPath = path.join(benchmarkDir, LEGACY_MANIFEST_NAME);

  if (!fs.existsSync(legacyManifestPath)) {
    throw new Error(`Wave 3 legacy manifest not found: ${legacyManifestPath}`);
  }

  const legacyManifest = readJson<Wave3LegacyFreezeManifest>(legacyManifestPath);
  const caseMap = buildWave3CaseMap(benchmarkDir, legacyManifest);
  const rawCases = [...caseMap.values()];
  const modalities = (legacyManifest.multimodalSlices ?? []).map((slice) => ({
    modality: slice.modality,
    caseCount: slice.caseCount,
  }));
  const canonicalManifestPath = path.join(benchmarkDir, CANONICAL_MANIFEST_NAME);

  if (fs.existsSync(canonicalManifestPath)) {
    const manifest = validateWave3CanonicalManifest(
      readJson<Wave3CanonicalManifest>(canonicalManifestPath)
    );

    return {
      manifest,
      cases: validateManifestMembership(manifest, caseMap),
      modalities,
      benchmarkDir,
      wave3Dir,
    };
  }

  const manifest = buildWave3CanonicalManifestFromLegacy({
    legacyManifest,
    cases: rawCases,
  });

  return {
    manifest,
    cases: validateManifestMembership(manifest, caseMap),
    modalities,
    benchmarkDir,
    wave3Dir,
  };
}

export function loadWave3CanonicalManifest(
  rootDir: string
): Wave3CanonicalManifest {
  return loadWave3CanonicalBundle(rootDir).manifest;
}
