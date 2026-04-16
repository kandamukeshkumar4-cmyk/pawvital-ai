export interface BenchmarkSuiteCase {
  id: string;
  tags?: string[];
  weight?: number;
  risk_tier?: string;
  complaint_family_tags?: string[];
  must_not_miss_marker?: boolean;
  expectations?: {
    responseType?: string;
  };
}

export interface BenchmarkSuite {
  suite_id: string;
  version: string;
  species: string;
  description: string;
  cases: BenchmarkSuiteCase[];
}

export interface CoverageSummary {
  suiteId: string;
  totalCases: number;
  totalWeightedCases: number;
  mustNotMissCount: number;
  uniqueComplaintFamilies: number;
  byResponseType: Record<string, number>;
  byRiskTier: Record<string, number>;
  byTag: Record<string, number>;
}

function increment(bucket: Record<string, number>, key: string) {
  bucket[key] = (bucket[key] || 0) + 1;
}

export function summarizeBenchmarkCoverage(
  suites: BenchmarkSuite[],
  mergedSuiteId = "gold-candidate-merged"
): CoverageSummary {
  const byResponseType: Record<string, number> = {};
  const byRiskTier: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  const complaintFamilies = new Set<string>();
  const cases = suites.flatMap((suite) => suite.cases);

  for (const row of cases) {
    increment(
      byResponseType,
      String(row.expectations?.responseType || "missing")
    );
    increment(byRiskTier, String(row.risk_tier || "unclassified"));
    for (const tag of row.tags || []) {
      increment(byTag, tag);
    }
    for (const family of row.complaint_family_tags || []) {
      complaintFamilies.add(family);
    }
  }

  return {
    suiteId: suites.length === 1 ? suites[0].suite_id : mergedSuiteId,
    totalCases: cases.length,
    totalWeightedCases: cases.reduce(
      (sum, row) => sum + (typeof row.weight === "number" ? row.weight : 1),
      0
    ),
    mustNotMissCount: cases.filter((row) => row.must_not_miss_marker === true)
      .length,
    uniqueComplaintFamilies: complaintFamilies.size,
    byResponseType,
    byRiskTier,
    byTag,
  };
}
