import fs from "node:fs";
import path from "node:path";

interface BenchmarkCase {
  id: string;
  description: string;
  tags?: string[];
  weight?: number;
  request: {
    pet?: {
      species?: string;
    };
    messages?: Array<{
      role?: string;
      content?: string;
    }>;
  };
  expectations?: {
    responseType?: string;
    readyForReport?: boolean;
    knownSymptomsInclude?: string[];
  };
  complaint_family_tags?: string[];
  risk_tier?: string;
  must_not_miss_marker?: boolean;
  wave3_strata?: string[];
  provenance?: {
    source_shard?: string;
  };
}

interface BenchmarkSuite {
  cases: BenchmarkCase[];
}

interface Wave3Manifest {
  caseIds: string[];
}

const BENCHMARK_DIR = path.join(
  process.cwd(),
  "data",
  "benchmarks",
  "dog-triage"
);

const FOCUS_CASES = [
  {
    id: "emergency-breathing-labored",
    expectedSymptoms: ["difficulty_breathing"],
    messageFragments: ["belly muscles", "flaring his nostrils", "lying still"],
  },
  {
    id: "emergency-choking-foreign-body",
    expectedSymptoms: ["difficulty_breathing"],
    messageFragments: ["pawing at his mouth", "gasping", "stuck in his throat"],
  },
  {
    id: "emergency-oral-bleeding-cant-swallow",
    expectedSymptoms: ["dental_problem"],
    messageFragments: ["blood coming from his mouth", "swallow water", "gagging"],
  },
  {
    id: "emergency-postpartum-eclampsia",
    expectedSymptoms: ["pregnancy_birth", "trembling"],
    messageFragments: ["nursing puppies", "trembling", "pacing restlessly"],
  },
  {
    id: "emergency-resting-open-mouth-breathing",
    expectedSymptoms: ["difficulty_breathing"],
    messageFragments: ["open-mouth breathing", "resting on the floor", "bluish-gray"],
  },
  {
    id: "emergency-burn-chemical",
    expectedSymptoms: ["wound_skin_issue"],
    messageFragments: ["drain cleaner", "blistered", "peeling"],
  },
  {
    id: "emergency-hit-by-car",
    expectedSymptoms: ["trauma"],
    messageFragments: ["hit by a car", "cannot stand", "cries"],
  },
  {
    id: "emergency-parvo-style-puppy",
    expectedSymptoms: ["vomiting_diarrhea_combined"],
    messageFragments: ["unvaccinated puppy", "bloody diarrhea", "keep water down"],
  },
  {
    id: "emergency-rat-poison-bleeding",
    expectedSymptoms: ["medication_reaction"],
    messageFragments: ["rat poison", "blood on his gums", "seems weak"],
  },
  {
    id: "emergency-heatstroke",
    expectedSymptoms: ["heat_intolerance"],
    messageFragments: ["out in the heat", "panting hard", "bright red"],
  },
  {
    id: "emergency-hemorrhagic-diarrhea-shock",
    expectedSymptoms: ["diarrhea"],
    messageFragments: ["explosive bloody diarrhea", "very weak", "gums are pale"],
  },
  {
    id: "emergency-protozoal-acute-babesia",
    expectedSymptoms: ["lethargy"],
    messageFragments: ["suddenly extremely weak", "gums are pale", "dark brown"],
  },
] as const;

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function loadCaseMap(relativePath: string): Map<string, BenchmarkCase> {
  const suite = readJson<BenchmarkSuite>(path.join(BENCHMARK_DIR, relativePath));
  return new Map(suite.cases.map((row) => [row.id, row]));
}

function comparableFixture(row: BenchmarkCase) {
  return {
    description: row.description,
    tags: row.tags ?? [],
    weight: row.weight ?? null,
    request: row.request,
    expectations: row.expectations ?? {},
  };
}

describe("VET-1323 dangerous benchmark regression pack", () => {
  const manifest = readJson<Wave3Manifest>(
    path.join(BENCHMARK_DIR, "wave3-freeze-manifest.json")
  );
  const emergencyCases = loadCaseMap(path.join("wave3-freeze", "emergency.json"));
  const rareButCriticalCases = loadCaseMap(
    path.join("wave3-freeze", "rare-but-critical.json")
  );

  it.each(FOCUS_CASES)(
    "$id stays source-aligned and explicitly visible in the dangerous freeze suite",
    ({ id, expectedSymptoms, messageFragments }) => {
      expect(manifest.caseIds).toContain(id);

      const emergencyCase = emergencyCases.get(id);
      const rareButCriticalCase = rareButCriticalCases.get(id);

      expect(emergencyCase).toBeDefined();
      expect(rareButCriticalCase).toBeDefined();

      const sourceShard = emergencyCase?.provenance?.source_shard;
      expect(sourceShard).toBeDefined();

      const sourceCase = loadCaseMap(path.join("gold-candidate", sourceShard!)).get(id);
      expect(sourceCase).toBeDefined();

      const ownerMessage =
        emergencyCase?.request.messages?.find((message) => message.role === "user")
          ?.content ?? "";

      expect(emergencyCase?.request.pet?.species).toBe("dog");
      expect(emergencyCase?.risk_tier).toBe("tier_1_emergency");
      expect(emergencyCase?.must_not_miss_marker).toBe(true);
      expect(emergencyCase?.wave3_strata).toEqual(
        expect.arrayContaining(["emergency", "rare-but-critical"])
      );
      expect(emergencyCase?.expectations?.responseType).toBe("emergency");
      expect(emergencyCase?.expectations?.readyForReport).toBe(true);
      expect(emergencyCase?.complaint_family_tags ?? []).toEqual(
        expect.arrayContaining(expectedSymptoms)
      );
      expect(emergencyCase?.expectations?.knownSymptomsInclude ?? []).toEqual(
        expect.arrayContaining(expectedSymptoms)
      );

      for (const fragment of messageFragments) {
        expect(ownerMessage).toContain(fragment);
      }

      expect(comparableFixture(sourceCase!)).toEqual(
        comparableFixture(emergencyCase!)
      );
      expect(comparableFixture(rareButCriticalCase!)).toEqual(
        comparableFixture(emergencyCase!)
      );
    }
  );
});
