import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface Wave3Stratum {
  fileName: string;
}

interface Wave3MultimodalSlice {
  fileName: string;
  modality: string;
  caseCount: number;
}

interface Wave3SuiteCase {
  id: string;
  complaint_family_tags?: string[];
  risk_tier?: string;
  request?: {
    pet?: {
      species?: string;
    };
  };
}

interface Wave3SuiteShard {
  species?: string;
  cases?: Wave3SuiteCase[];
}

interface Wave3CanonicalManifest {
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
  version: string;
  uniqueCaseCount: number;
  strata: Wave3Stratum[];
  multimodalSlices: Wave3MultimodalSlice[];
}

const ROOT = process.cwd();
const BENCHMARK_DIR = path.join(ROOT, "data", "benchmarks", "dog-triage");
const MANIFEST_PATH = path.join(BENCHMARK_DIR, "wave3-freeze-manifest.json");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function sortCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  );
}

function parseSliceRecords(filePath: string): unknown[] {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return [];
  }

  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    assert(Array.isArray(parsed), `Expected multimodal slice array in ${normalizePath(filePath)}`);
    return parsed;
  }

  return raw.split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Invalid JSON in multimodal slice ${normalizePath(filePath)} line ${index + 1}: ${message}`
      );
    }
  });
}

function deriveCanonicalSummary(manifest: Wave3CanonicalManifest) {
  assert(Array.isArray(manifest.strata) && manifest.strata.length > 0, "Canonical manifest is missing strata.");

  const shardPaths = manifest.strata.map((shard) => {
    assert(typeof shard.fileName === "string" && shard.fileName.trim(), "Every stratum must declare fileName.");
    return `data/benchmarks/dog-triage/wave3-freeze/${shard.fileName}`;
  });

  const caseMap = new Map<string, Wave3SuiteCase>();
  const complaintFamilyCounts: Record<string, number> = {};
  const riskTierCounts: Record<string, number> = {};

  for (const relativePath of shardPaths) {
    const shardPath = path.join(ROOT, relativePath);
    assert(fs.existsSync(shardPath), `Canonical shard path is stale: ${relativePath}`);

    const shard = readJson<Wave3SuiteShard>(shardPath);
    assert(shard.species === "dog", `Shard ${relativePath} must declare species=\"dog\".`);

    for (const caseRecord of shard.cases ?? []) {
      assert(caseRecord.id?.trim(), `Shard ${relativePath} contains a case without an id.`);
      assert(
        caseRecord.request?.pet?.species === "dog",
        `Case ${caseRecord.id} in ${relativePath} is not dog-only.`
      );

      if (!caseMap.has(caseRecord.id)) {
        caseMap.set(caseRecord.id, caseRecord);
        riskTierCounts[caseRecord.risk_tier ?? "missing"] =
          (riskTierCounts[caseRecord.risk_tier ?? "missing"] ?? 0) + 1;

        for (const family of caseRecord.complaint_family_tags ?? []) {
          complaintFamilyCounts[family] = (complaintFamilyCounts[family] ?? 0) + 1;
        }
      }
    }
  }

  const modalityCounts: Record<string, number> = {};
  for (const slice of manifest.multimodalSlices ?? []) {
    assert(
      typeof slice.fileName === "string" && slice.fileName.trim(),
      "Every multimodal slice must declare fileName."
    );
    assert(
      typeof slice.modality === "string" && slice.modality.trim(),
      `Multimodal slice ${slice.fileName} is missing modality.`
    );

    const relativePath = `data/benchmarks/dog-triage/multimodal-slices/${slice.fileName}`;
    const slicePath = path.join(ROOT, relativePath);
    assert(fs.existsSync(slicePath), `Canonical multimodal slice path is stale: ${relativePath}`);

    const records = parseSliceRecords(slicePath);
    assert(
      records.length === slice.caseCount,
      `Multimodal slice ${relativePath} expected ${slice.caseCount} records but found ${records.length}.`
    );
    modalityCounts[slice.modality] = records.length;
  }

  return {
    suiteId: manifest.suiteId,
    suiteVersion: manifest.suiteVersion,
    generatedAt: manifest.generatedAt,
    caseIds: Array.from(caseMap.keys()).sort((left, right) => left.localeCompare(right)),
    shardPaths,
    totalCases: caseMap.size,
    complaintFamilyCounts: sortCounts(complaintFamilyCounts),
    riskTierCounts: sortCounts(riskTierCounts),
    modalityCounts: sortCounts(modalityCounts),
  };
}

function hashCanonicalSummary(summary: ReturnType<typeof deriveCanonicalSummary>): string {
  return crypto.createHash("sha256").update(JSON.stringify(summary)).digest("hex");
}

describe("Wave 3 canonical suite manifest", () => {
  const manifest = readJson<Wave3CanonicalManifest>(MANIFEST_PATH);
  const derived = deriveCanonicalSummary(manifest);

  it("declares the required canonical contract fields", () => {
    assert(manifest.suiteId === "dog-triage-wave3-freeze", "suiteId must stay dog-triage-wave3-freeze.");
    assert(manifest.suiteVersion === manifest.version, "suiteVersion must stay aligned with version.");
    assert(
      Number.isFinite(new Date(manifest.generatedAt).valueOf()),
      "generatedAt must be a valid timestamp."
    );
    assert(
      /^[a-f0-9]{64}$/u.test(manifest.manifestHash),
      "manifestHash must be a 64-character lowercase SHA-256 hex digest."
    );
    assert(Array.isArray(manifest.caseIds) && manifest.caseIds.length > 0, "caseIds must be a non-empty array.");
    assert(
      Array.isArray(manifest.shardPaths) && manifest.shardPaths.length > 0,
      "shardPaths must be a non-empty array."
    );
    assert(Number.isInteger(manifest.totalCases) && manifest.totalCases > 0, "totalCases must be a positive integer.");
    assert(
      manifest.complaintFamilyCounts && typeof manifest.complaintFamilyCounts === "object",
      "complaintFamilyCounts must be present."
    );
    assert(
      manifest.riskTierCounts && typeof manifest.riskTierCounts === "object",
      "riskTierCounts must be present."
    );
    assert(
      manifest.modalityCounts && typeof manifest.modalityCounts === "object",
      "modalityCounts must be present."
    );
  });

  it("keeps shard paths, unique ids, and rolled-up counts aligned with the live shards", () => {
    expect(manifest.shardPaths).toEqual(derived.shardPaths);
    expect(manifest.caseIds).toEqual(derived.caseIds);
    expect(manifest.totalCases).toBe(derived.totalCases);
    expect(manifest.uniqueCaseCount).toBe(derived.totalCases);
    expect(manifest.complaintFamilyCounts).toEqual(derived.complaintFamilyCounts);
    expect(manifest.riskTierCounts).toEqual(derived.riskTierCounts);
    expect(manifest.modalityCounts).toEqual(derived.modalityCounts);
  });

  it("enforces a dog-only canonical suite and unique case ids", () => {
    expect(new Set(manifest.caseIds).size).toBe(manifest.caseIds.length);
    expect(manifest.caseIds.length).toBe(manifest.totalCases);
    expect(manifest.caseIds.length).toBe(manifest.uniqueCaseCount);
  });

  it("keeps the manifest hash stable over the canonical contract fields", () => {
    expect(manifest.manifestHash).toBe(hashCanonicalSummary(derived));
  });

  it("keeps the runpod dry-run suite identity aligned with the canonical manifest contract", () => {
    const outputPath = path.join(
      os.tmpdir(),
      `wave3-runpod-dry-run-${process.pid}-${Date.now()}.json`
    );

    try {
      execFileSync(
        process.execPath,
        [
          "scripts/runpod-benchmark.mjs",
          "--dry-run",
          "--input=data/benchmarks/dog-triage/wave3-freeze",
          `--output=${outputPath}`,
        ],
        {
          cwd: ROOT,
          stdio: "pipe",
        }
      );

      const report = readJson<{ suiteId: string; caseCount: number }>(outputPath);
      expect(report.suiteId).toBe(manifest.suiteId);
      expect(report.caseCount).toBe(manifest.totalCases);
    } finally {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    }
  });
});
