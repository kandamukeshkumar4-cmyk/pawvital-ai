import { getComplaintModules } from "@/lib/clinical-intelligence/complaint-modules";
import {
  getAllComplaintSourceMapEntries,
  getComplaintSourceMapEntry,
} from "@/lib/clinical-intelligence/vet-knowledge/complaint-source-map";
import {
  getAllCoverageEntries,
  getCoverageByModuleId,
  type CoverageLevel,
  type OwnerVisibleCitationLevel,
} from "@/lib/clinical-intelligence/vet-knowledge/coverage-gap-registry";
import {
  getAllGapEntries,
  getGapByModuleId,
  type GapPriority,
} from "@/lib/clinical-intelligence/vet-knowledge/source-gap-plan";

type AuditRow = {
  moduleId: string;
  displayName: string;
  sourceCoverage: CoverageLevel;
  ownerVisibleCitationCoverage: OwnerVisibleCitationLevel;
  priority: GapPriority;
  citationIntent: "owner_visible_citation" | "none";
};

const EXPECTED_AUDIT_ROWS: AuditRow[] = [
  {
    moduleId: "skin_itching_allergy",
    displayName: "Skin Itching / Allergy",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    priority: "high",
    citationIntent: "owner_visible_citation",
  },
  {
    moduleId: "gi_vomiting_diarrhea",
    displayName: "GI Vomiting / Diarrhea",
    sourceCoverage: "strong",
    ownerVisibleCitationCoverage: "available",
    priority: "not_needed",
    citationIntent: "owner_visible_citation",
  },
  {
    moduleId: "limping_mobility_pain",
    displayName: "Limping / Mobility Pain",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    priority: "high",
    citationIntent: "owner_visible_citation",
  },
  {
    moduleId: "respiratory_distress",
    displayName: "Respiratory Distress / Coughing / Breathing Difficulty",
    sourceCoverage: "strong",
    ownerVisibleCitationCoverage: "available",
    priority: "not_needed",
    citationIntent: "owner_visible_citation",
  },
  {
    moduleId: "seizure_collapse_neuro",
    displayName: "Seizure / Collapse / Neurologic Emergency",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    priority: "high",
    citationIntent: "owner_visible_citation",
  },
  {
    moduleId: "urinary_obstruction",
    displayName: "Urinary Obstruction / Urination Problems",
    sourceCoverage: "missing",
    ownerVisibleCitationCoverage: "missing",
    priority: "critical",
    citationIntent: "none",
  },
  {
    moduleId: "toxin_poisoning_exposure",
    displayName: "Toxin / Poisoning / Exposure",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    priority: "high",
    citationIntent: "owner_visible_citation",
  },
  {
    moduleId: "bloat_gdv",
    displayName: "Bloat / GDV / Abdominal Distension",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    priority: "high",
    citationIntent: "owner_visible_citation",
  },
  {
    moduleId: "collapse_weakness",
    displayName: "Collapse / Weakness / Fainting",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    priority: "high",
    citationIntent: "owner_visible_citation",
  },
  {
    moduleId: "heatstroke_heat_exposure",
    displayName: "Heatstroke / Heat Exposure",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    priority: "high",
    citationIntent: "owner_visible_citation",
  },
  {
    moduleId: "trauma_bleeding_wound",
    displayName: "Trauma / Bleeding / Wound",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    priority: "high",
    citationIntent: "owner_visible_citation",
  },
];

describe("Complaint Module Registry Gap Audit (VET-1424K packaging)", () => {
  it("tracks the full complaint-module registry with no omissions", () => {
    const registeredIds = getComplaintModules().map((module) => module.id).sort();
    const auditedIds = EXPECTED_AUDIT_ROWS.map((row) => row.moduleId).sort();

    expect(registeredIds).toEqual(auditedIds);
    expect(getAllComplaintSourceMapEntries()).toHaveLength(EXPECTED_AUDIT_ROWS.length);
    expect(getAllCoverageEntries()).toHaveLength(EXPECTED_AUDIT_ROWS.length);
    expect(getAllGapEntries()).toHaveLength(EXPECTED_AUDIT_ROWS.length);
  });

  it.each(EXPECTED_AUDIT_ROWS)(
    "captures the current registry facts for $moduleId",
    ({ moduleId, displayName, sourceCoverage, ownerVisibleCitationCoverage, priority, citationIntent }) => {
      const sourceMapEntry = getComplaintSourceMapEntry(moduleId);
      const coverageEntry = getCoverageByModuleId(moduleId);
      const gapEntry = getGapByModuleId(moduleId);

      expect(sourceMapEntry).toBeDefined();
      expect(sourceMapEntry?.displayName).toBe(displayName);
      expect(sourceMapEntry?.citationIntent).toBe(citationIntent);

      expect(coverageEntry).toBeDefined();
      expect(coverageEntry?.sourceCoverage).toBe(sourceCoverage);
      expect(coverageEntry?.ownerVisibleCitationCoverage).toBe(
        ownerVisibleCitationCoverage
      );

      expect(gapEntry).toBeDefined();
      expect(gapEntry?.coverageStatus).toBe(sourceCoverage);
      expect(gapEntry?.ownerVisibleCitationNeed).toBe(
        ownerVisibleCitationCoverage
      );
      expect(gapEntry?.priority).toBe(priority);
    }
  );

  it("keeps the current coverage distribution stable", () => {
    const byCoverage = EXPECTED_AUDIT_ROWS.reduce<Record<CoverageLevel, number>>(
      (counts, row) => {
        counts[row.sourceCoverage] += 1;
        return counts;
      },
      {
        strong: 0,
        partial: 0,
        missing: 0,
      }
    );

    expect(byCoverage).toEqual({
      strong: 2,
      partial: 8,
      missing: 1,
    });
  });

  it("keeps the current owner-visible citation distribution stable", () => {
    const byCitationCoverage = EXPECTED_AUDIT_ROWS.reduce<
      Record<OwnerVisibleCitationLevel, number>
    >(
      (counts, row) => {
        counts[row.ownerVisibleCitationCoverage] += 1;
        return counts;
      },
      {
        available: 0,
        emergency_only: 0,
        missing: 0,
      }
    );

    expect(byCitationCoverage).toEqual({
      available: 2,
      emergency_only: 8,
      missing: 1,
    });
  });

  it("keeps the current gap-priority distribution stable", () => {
    const byPriority = EXPECTED_AUDIT_ROWS.reduce<Record<GapPriority, number>>(
      (counts, row) => {
        counts[row.priority] += 1;
        return counts;
      },
      {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        not_needed: 0,
      }
    );

    expect(byPriority).toEqual({
      critical: 1,
      high: 8,
      medium: 0,
      low: 0,
      not_needed: 2,
    });
  });

  it("records urinary_obstruction as the only current critical gap", () => {
    const criticalRows = EXPECTED_AUDIT_ROWS.filter(
      (row) => row.priority === "critical"
    );

    expect(criticalRows).toEqual([
      {
        moduleId: "urinary_obstruction",
        displayName: "Urinary Obstruction / Urination Problems",
        sourceCoverage: "missing",
        ownerVisibleCitationCoverage: "missing",
        priority: "critical",
        citationIntent: "none",
      },
    ]);
  });

  it("records the high-priority partial-gap set exactly", () => {
    const highPriorityIds = EXPECTED_AUDIT_ROWS.filter(
      (row) => row.priority === "high"
    ).map((row) => row.moduleId);

    expect(highPriorityIds).toEqual([
      "skin_itching_allergy",
      "limping_mobility_pain",
      "seizure_collapse_neuro",
      "toxin_poisoning_exposure",
      "bloat_gdv",
      "collapse_weakness",
      "heatstroke_heat_exposure",
      "trauma_bleeding_wound",
    ]);
  });
});
