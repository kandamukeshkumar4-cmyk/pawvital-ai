import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface Wave3CanonicalManifest {
  suiteId: string;
  suiteVersion: string;
  generatedAt: string;
  manifestHash: string;
  caseIds: string[];
  shardPaths: string[];
  totalCases: number;
  complaintFamilyCounts: Record<string, number>;
  riskTierCounts: Record<string, number>;
  modalityCounts: Record<string, number>;
  sourceInput?: string;
  highRiskCaseCount?: number;
  version?: string;
  uniqueCaseCount?: number;
  shardHash?: string;
  strata?: Array<{
    key?: string;
    title?: string;
    fileName: string;
    caseCount?: number;
    dualReviewRequiredCount?: number;
  }>;
  multimodalSlices?: Array<{
    fileName?: string;
    modality?: string;
    caseCount?: number;
  }>;
}

export interface Wave3CanonicalCase {
  id: string;
  complaint_family_tags?: string[];
  risk_tier?: string;
  wave3_strata?: string[];
  must_not_miss_marker?: boolean;
  [key: string]: unknown;
}

interface Wave3SuiteFile {
  cases?: Wave3CanonicalCase[];
}

export interface LoadedWave3CanonicalSuite {
  manifest: Wave3CanonicalManifest;
  cases: Wave3CanonicalCase[];
  caseMap: Map<string, Wave3CanonicalCase>;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function incrementCount(
  counts: Record<string, number>,
  key: string | undefined
): void {
  if (!key) return;
  counts[key] = (counts[key] ?? 0) + 1;
}

function normalizeShardPaths(
  manifestDir: string,
  rawManifest: Partial<Wave3CanonicalManifest>
): string[] {
  const fromManifest = rawManifest.shardPaths ?? [];
  if (fromManifest.length > 0) {
    return fromManifest.map((entry) =>
      entry.replace(/\\/g, "/").replace(/^\.\//, "")
    );
  }

  return (rawManifest.strata ?? []).map((entry) =>
    path
      .relative(
        manifestDir,
        path.join(manifestDir, "wave3-freeze", entry.fileName)
      )
      .replace(/\\/g, "/")
  );
}

function loadCasesFromShardPaths(
  manifestPath: string,
  shardPaths: string[]
): { cases: Wave3CanonicalCase[]; caseMap: Map<string, Wave3CanonicalCase> } {
  const manifestDir = path.dirname(manifestPath);
  const caseMap = new Map<string, Wave3CanonicalCase>();

  for (const shardPath of shardPaths) {
    const suite = readJson<Wave3SuiteFile>(path.resolve(manifestDir, shardPath));
    for (const caseRecord of suite.cases ?? []) {
      if (!caseMap.has(caseRecord.id)) {
        caseMap.set(caseRecord.id, caseRecord);
      }
    }
  }

  return {
    cases: [...caseMap.values()],
    caseMap,
  };
}

function buildCountMaps(cases: Wave3CanonicalCase[]) {
  const complaintFamilyCounts: Record<string, number> = {};
  const riskTierCounts: Record<string, number> = {};

  for (const caseRecord of cases) {
    incrementCount(riskTierCounts, caseRecord.risk_tier);
    for (const family of caseRecord.complaint_family_tags ?? []) {
      incrementCount(complaintFamilyCounts, family);
    }
  }

  return { complaintFamilyCounts, riskTierCounts };
}

function buildModalityCounts(rawManifest: Partial<Wave3CanonicalManifest>) {
  const modalityCounts: Record<string, number> = {
    ...(rawManifest.modalityCounts ?? {}),
  };

  for (const slice of rawManifest.multimodalSlices ?? []) {
    if (!slice.modality || typeof slice.caseCount !== "number") {
      continue;
    }
    modalityCounts[slice.modality] = slice.caseCount;
  }

  return modalityCounts;
}

function buildManifestHash(input: {
  suiteId: string;
  suiteVersion: string;
  shardPaths: string[];
  caseIds: string[];
  totalCases: number;
  complaintFamilyCounts: Record<string, number>;
  riskTierCounts: Record<string, number>;
  modalityCounts: Record<string, number>;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        suiteId: input.suiteId,
        suiteVersion: input.suiteVersion,
        shardPaths: input.shardPaths,
        caseIds: input.caseIds,
        totalCases: input.totalCases,
        complaintFamilyCounts: input.complaintFamilyCounts,
        riskTierCounts: input.riskTierCounts,
        modalityCounts: input.modalityCounts,
      })
    )
    .digest("hex");
}

export function loadWave3CanonicalSuite(
  manifestPath: string
): LoadedWave3CanonicalSuite {
  const rawManifest = readJson<Partial<Wave3CanonicalManifest>>(manifestPath);
  const manifestDir = path.dirname(manifestPath);
  const shardPaths = normalizeShardPaths(manifestDir, rawManifest);
  const { cases, caseMap } = loadCasesFromShardPaths(manifestPath, shardPaths);
  const caseIds = [...caseMap.keys()].sort((left, right) =>
    left.localeCompare(right)
  );
  const { complaintFamilyCounts, riskTierCounts } = buildCountMaps(cases);
  const modalityCounts = buildModalityCounts(rawManifest);

  const suiteId = rawManifest.suiteId || "wave3-freeze";
  const suiteVersion = rawManifest.suiteVersion || rawManifest.version || "wave3-freeze-v2";
  const totalCases =
    rawManifest.totalCases ?? rawManifest.uniqueCaseCount ?? caseIds.length;

  if (totalCases !== caseIds.length) {
    throw new Error(
      `Wave 3 manifest expected ${totalCases} canonical cases but loaded ${caseIds.length}.`
    );
  }

  if (rawManifest.caseIds) {
    const expectedCaseIds = [...rawManifest.caseIds].sort((left, right) =>
      left.localeCompare(right)
    );
    const extraCaseIds = caseIds.filter((caseId) => !expectedCaseIds.includes(caseId));
    const missingCaseIds = expectedCaseIds.filter(
      (caseId) => !caseIds.includes(caseId)
    );

    if (extraCaseIds.length > 0 || missingCaseIds.length > 0) {
      throw new Error(
        `Wave 3 manifest case IDs drifted from shard contents. extra=${extraCaseIds.join(", ") || "none"} missing=${missingCaseIds.join(", ") || "none"}`
      );
    }
  }

  const manifestHash =
    rawManifest.manifestHash ||
    rawManifest.shardHash ||
    buildManifestHash({
      suiteId,
      suiteVersion,
      shardPaths,
      caseIds,
      totalCases,
      complaintFamilyCounts,
      riskTierCounts,
      modalityCounts,
    });

  return {
    manifest: {
      ...rawManifest,
      suiteId,
      suiteVersion,
      generatedAt: rawManifest.generatedAt || new Date(0).toISOString(),
      manifestHash,
      caseIds,
      shardPaths,
      totalCases,
      complaintFamilyCounts:
        rawManifest.complaintFamilyCounts ?? complaintFamilyCounts,
      riskTierCounts: rawManifest.riskTierCounts ?? riskTierCounts,
      modalityCounts,
      version: rawManifest.version || suiteVersion,
      uniqueCaseCount: rawManifest.uniqueCaseCount ?? totalCases,
      shardHash: rawManifest.shardHash || manifestHash,
    },
    cases,
    caseMap,
  };
}
