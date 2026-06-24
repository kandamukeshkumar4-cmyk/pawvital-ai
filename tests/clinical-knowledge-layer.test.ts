/**
 * Phase 8 — curated clinical knowledge layer (deterministic, vet-safe).
 *
 * Covers the four modules: knowledge-base, clinical-patterns,
 * root-cause-hypotheses, supplement-guardrails. The recurring theme is the hard
 * safety contract: no diagnosis, no dosage/brand/price, evidence-linked only,
 * and the owner-facing urgency floor never poses as the deterministic triage
 * urgency.
 */
import {
  CLINICAL_KNOWLEDGE,
  getKnowledgeForSignal,
  getKnowledgeByDomain,
  maxUrgencyFloor,
  type ClinicalKnowledgeEntry,
} from "@/lib/clinical/knowledge-base";
import {
  CLINICAL_PATTERNS,
  matchClinicalPatterns,
} from "@/lib/clinical/clinical-patterns";
import {
  buildRootCauseHypotheses,
  HYPOTHESIS_SAFETY_BOUNDARY,
} from "@/lib/clinical/root-cause-hypotheses";
import {
  validateSupplementSuggestion,
  buildSupplementSuggestion,
  type SupplementSuggestion,
} from "@/lib/clinical/supplement-guardrails";

// Forbidden patterns scanned across ALL curated owner-facing strings.
const DOSAGE = /\b\d+(\.\d+)?\s*(mg|mcg|µg|ml|iu|cc|tsp|tbsp|capsules?|tablets?|scoops?|chews?)\b/i;
const PRICE = /(\$\s*\d|\b\d+\s*(usd|dollars?)\b)/i;
const TRADEMARK = /[®™]/;
const DISEASE_CLAIM = /\b(prevents?|cures?|reverses?)\b[\s\w]*\b(disease|cancer|arthritis|infection)\b/i;

function entryStrings(e: ClinicalKnowledgeEntry): string[] {
  return [
    ...e.owner_observable_questions,
    ...e.missing_information,
    ...e.vet_handoff_points,
  ];
}

describe("knowledge-base — curated + safe", () => {
  it("every domain has an entry and entries are well-formed", () => {
    const domains = new Set(CLINICAL_KNOWLEDGE.map((e) => e.domain));
    for (const d of [
      "gi",
      "urinary",
      "skin_ear",
      "respiratory",
      "mobility",
      "senior",
      "medication_supplement",
      "toxin_exposure",
    ]) {
      expect(domains.has(d as ClinicalKnowledgeEntry["domain"])).toBe(true);
    }
    for (const e of CLINICAL_KNOWLEDGE) {
      expect(e.owner_observable_questions.length).toBeGreaterThan(0);
      expect(e.vet_handoff_points.length).toBeGreaterThan(0);
      expect(e.disallowed_outputs.length).toBeGreaterThan(0);
      expect(e.source_refs.length).toBeGreaterThan(0);
    }
  });

  it("contains no dosage / price / brand / disease-claim text anywhere", () => {
    for (const e of CLINICAL_KNOWLEDGE) {
      for (const s of entryStrings(e)) {
        expect(DOSAGE.test(s)).toBe(false);
        expect(PRICE.test(s)).toBe(false);
        expect(TRADEMARK.test(s)).toBe(false);
        expect(DISEASE_CLAIM.test(s)).toBe(false);
      }
    }
  });

  it("getKnowledgeForSignal joins by trigger signal; getKnowledgeByDomain by domain", () => {
    expect(getKnowledgeForSignal("stool_change").some((e) => e.domain === "gi")).toBe(true);
    expect(getKnowledgeByDomain("urinary").length).toBeGreaterThan(0);
    expect(getKnowledgeForSignal("stool_change").every((e) =>
      e.trigger_signal_keys.includes("stool_change"),
    )).toBe(true);
  });

  it("maxUrgencyFloor never lowers a floor", () => {
    expect(maxUrgencyFloor("self_monitor", "emergency")).toBe("emergency");
    expect(maxUrgencyFloor("urgent", "watch")).toBe("urgent");
    expect(maxUrgencyFloor("call_vet", "call_vet")).toBe("call_vet");
  });
});

describe("clinical-patterns — cluster matching", () => {
  it("matches a digestive pattern only when >= min_signals are present", () => {
    expect(matchClinicalPatterns(["stool_change"]).map((p) => p.id)).not.toContain(
      "digestive_pattern",
    );
    expect(
      matchClinicalPatterns(["stool_change", "vomiting_trend"]).map((p) => p.id),
    ).toContain("digestive_pattern");
  });

  it("returns strongest urgency floor first", () => {
    const matched = matchClinicalPatterns([
      "skin_ear_change", // watch
      "breathing_cough_change", // urgent
    ]);
    expect(matched[0].urgency_floor).toBe("urgent");
  });

  it("empty input → no patterns; single-signal patterns still match at min 1", () => {
    expect(matchClinicalPatterns([])).toEqual([]);
    expect(matchClinicalPatterns(["mobility_pain_change"]).map((p) => p.id)).toContain(
      "mobility_discomfort_pattern",
    );
  });

  it("no pattern label is a disease name", () => {
    for (const p of CLINICAL_PATTERNS) {
      expect(p.label).toMatch(/pattern|concern|possibility/);
    }
  });
});

describe("root-cause-hypotheses — non-diagnostic, evidence-gated", () => {
  it("produces a hypothesis only when there is dog-specific evidence", () => {
    const none = buildRootCauseHypotheses({
      presentSignalKeys: ["stool_change", "vomiting_trend"],
      evidenceSummaries: {}, // no evidence
    });
    expect(none).toEqual([]);

    const some = buildRootCauseHypotheses({
      presentSignalKeys: ["stool_change", "vomiting_trend"],
      evidenceSummaries: {
        stool_change: "softer stool logged several times in the last 10 days",
        vomiting_trend: "vomited twice today",
      },
    });
    expect(some.length).toBeGreaterThan(0);
    const h = some[0];
    expect(h.hypothesis_label).toBe("digestive pattern");
    expect(h.supporting_evidence.length).toBeGreaterThan(0);
    expect(h.next_best_question.length).toBeGreaterThan(0);
    expect(h.safety_boundary).toBe(HYPOTHESIS_SAFETY_BOUNDARY);
  });

  it("never exposes a disease name in the label or safety boundary", () => {
    const hs = buildRootCauseHypotheses({
      presentSignalKeys: ["water_urination_change", "vomiting_trend"],
      evidenceSummaries: { water_urination_change: "drinking much more this week" },
    });
    for (const h of hs) {
      expect(h.hypothesis_label).not.toMatch(/cancer|parvo|diabetes|disease/i);
    }
  });

  it("safety boundary states emergency overrides the pattern", () => {
    expect(HYPOTHESIS_SAFETY_BOUNDARY.toLowerCase()).toContain("not a diagnosis");
    expect(HYPOTHESIS_SAFETY_BOUNDARY.toLowerCase()).toContain("emergency");
  });
});

describe("supplement-guardrails — hard fails", () => {
  const VALID: SupplementSuggestion = {
    name: "gut-support supplement (ask your vet)",
    category: "gut_support",
    purpose: "Whether a gut-support supplement might help, decided with your vet.",
    why_ask_vet: "Ask your vet whether a gut-support supplement is appropriate.",
    evidence_summary: "softer stool on several of the last ten days",
    reason_signal_key: "stool_change",
    related_memory_ids: ["evt-1", "evt-2"],
    safety_note: "Only start a supplement if your vet agrees.",
    follow_up_question: "After your vet visit, did things get better, same, or worse?",
    follow_up_due_days: 7,
    priority: "ask_vet",
  };

  it("accepts a well-formed, evidence-linked suggestion", () => {
    expect(validateSupplementSuggestion(VALID).ok).toBe(true);
  });

  it("rejects dosage text", () => {
    const r = validateSupplementSuggestion({ ...VALID, purpose: "Give 500 mg twice daily." });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain("dosage");
  });

  it("rejects brand and price", () => {
    expect(
      validateSupplementSuggestion({ ...VALID, name: "Cosequin chews" }).violations.map((v) => v.code),
    ).toContain("brand");
    expect(
      validateSupplementSuggestion({ ...VALID, purpose: "Only $19.99 to buy." }).violations.map((v) => v.code),
    ).toContain("price");
  });

  it("rejects disease-prevention claims", () => {
    const r = validateSupplementSuggestion({
      ...VALID,
      why_ask_vet: "This prevents arthritis for sure.",
    });
    expect(r.violations.map((v) => v.code)).toContain("disease_claim");
  });

  it("rejects a suggestion with no dog-specific evidence", () => {
    const r = validateSupplementSuggestion({
      ...VALID,
      reason_signal_key: "",
      related_memory_ids: [],
      evidence_summary: "",
    });
    expect(r.violations.map((v) => v.code)).toContain("no_evidence");
  });

  it("builder returns null without evidence and a valid suggestion with it", () => {
    expect(
      buildSupplementSuggestion({ signalKey: "stool_change", evidenceSummary: "", relatedMemoryIds: [] }),
    ).toBeNull();

    const built = buildSupplementSuggestion({
      signalKey: "stool_change",
      evidenceSummary: "softer stool several times in ten days",
      relatedMemoryIds: ["evt-9"],
    });
    expect(built).not.toBeNull();
    expect(built!.category).toBe("gut_support");
    expect(built!.priority).toBe("ask_vet");
    // The builder's own output must always pass the guardrails.
    expect(validateSupplementSuggestion(built!).ok).toBe(true);
  });
});
