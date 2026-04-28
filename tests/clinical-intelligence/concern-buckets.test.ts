import {
  createInitialClinicalCaseState,
  type ClinicalCaseState,
  type ClinicalSignal,
} from "@/lib/clinical-intelligence/case-state";

import {
  updateRedFlagStatus,
  recordAnsweredQuestion,
  addClinicalSignal,
} from "@/lib/clinical-intelligence/case-state-update";

import {
  getConcernBucketDefinitions,
  getConcernBucketDefinitionById,
  getAllMustNotMissBucketIds,
} from "@/lib/clinical-intelligence/concern-buckets";

import {
  scoreConcernBuckets,
  getTopConcernBuckets,
  hasMustNotMissConcern,
  mergeConcernBucketsIntoCaseState,
} from "@/lib/clinical-intelligence/concern-bucket-scoring";

describe("Concern bucket definitions", () => {
  it("initializes all expected bucket definitions", () => {
    const definitions = getConcernBucketDefinitions();

    expect(definitions.length).toBe(13);

    const expectedIds = [
      "emergency_airway_breathing",
      "emergency_circulation_shock",
      "bloat_gdv_pattern",
      "toxin_exposure_pattern",
      "urinary_obstruction_pattern",
      "seizure_neuro_pattern",
      "trauma_severe_pain",
      "gi_dehydration_or_blood",
      "skin_allergy_emergency",
      "skin_irritation_or_parasite",
      "routine_mild_skin",
      "routine_mild_limp",
      "unclear_needs_more_info",
    ];

    const actualIds = definitions.map((d) => d.id);
    for (const expectedId of expectedIds) {
      expect(actualIds).toContain(expectedId);
    }
  });

  it("every bucket has labelForLogs without diagnosis/treatment language", () => {
    const definitions = getConcernBucketDefinitions();
    const forbiddenPatterns = [
      /diagnos/i,
      /treat/i,
      /cure/i,
      /medication/i,
      /prescription/i,
      /surgery/i,
      /antibiotic/i,
    ];

    for (const def of definitions) {
      for (const pattern of forbiddenPatterns) {
        expect(def.labelForLogs).not.toMatch(pattern);
      }
    }
  });

  it("getConcernBucketDefinitionById returns correct definition", () => {
    const def = getConcernBucketDefinitionById("bloat_gdv_pattern");

    expect(def).toBeDefined();
    expect(def?.id).toBe("bloat_gdv_pattern");
    expect(def?.mustNotMiss).toBe(true);
    expect(def?.redFlagIds).toContain("unproductive_retching");
  });

  it("getConcernBucketDefinitionById returns undefined for unknown id", () => {
    expect(getConcernBucketDefinitionById("nonexistent_bucket")).toBeUndefined();
  });

  it("getAllMustNotMissBucketIds returns only must-not-miss buckets", () => {
    const mustNotMissIds = getAllMustNotMissBucketIds();

    expect(mustNotMissIds).toContain("emergency_airway_breathing");
    expect(mustNotMissIds).toContain("emergency_circulation_shock");
    expect(mustNotMissIds).toContain("bloat_gdv_pattern");
    expect(mustNotMissIds).toContain("toxin_exposure_pattern");
    expect(mustNotMissIds).toContain("urinary_obstruction_pattern");
    expect(mustNotMissIds).toContain("seizure_neuro_pattern");
    expect(mustNotMissIds).toContain("trauma_severe_pain");
    expect(mustNotMissIds).toContain("skin_allergy_emergency");
    expect(mustNotMissIds).not.toContain("routine_mild_skin");
    expect(mustNotMissIds).not.toContain("routine_mild_limp");
    expect(mustNotMissIds).not.toContain("unclear_needs_more_info");
  });
});

describe("Scoring: breathing red flags", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("scores breathing red flags into emergency_airway_breathing", () => {
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      evidenceText: "Owner reports blue gums",
      turn: 1,
    });
    state = updateRedFlagStatus(state, "breathing_difficulty", {
      status: "positive",
      source: "explicit_answer",
      turn: 2,
    });

    const scored = scoreConcernBuckets(state);
    const breathing = scored.find((b) => b.id === "emergency_airway_breathing");

    expect(breathing).toBeDefined();
    expect(breathing!.score).toBeGreaterThanOrEqual(70);
    expect(breathing!.evidence.length).toBeGreaterThanOrEqual(2);
    expect(breathing!.mustNotMiss).toBe(true);
  });
});

describe("Scoring: collapse/shock", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("scores collapse/pale gums into emergency_circulation_shock", () => {
    state = updateRedFlagStatus(state, "collapse", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });
    state = updateRedFlagStatus(state, "pale_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 2,
    });

    const scored = scoreConcernBuckets(state);
    const shock = scored.find((b) => b.id === "emergency_circulation_shock");

    expect(shock).toBeDefined();
    expect(shock!.score).toBeGreaterThanOrEqual(70);
    expect(shock!.mustNotMiss).toBe(true);
  });
});

describe("Scoring: bloat/GDV", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("scores retching/swollen abdomen signals into bloat_gdv_pattern", () => {
    state = updateRedFlagStatus(state, "unproductive_retching", {
      status: "positive",
      source: "explicit_answer",
      evidenceText: "Unproductive retching confirmed",
      turn: 1,
    });

    const scored = scoreConcernBuckets(state);
    const bloat = scored.find((b) => b.id === "bloat_gdv_pattern");

    expect(bloat).toBeDefined();
    expect(bloat!.score).toBeGreaterThanOrEqual(35);
    expect(bloat!.mustNotMiss).toBe(true);
  });
});

describe("Scoring: toxin exposure", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("scores toxin exposure into toxin_exposure_pattern", () => {
    state = updateRedFlagStatus(state, "toxin_confirmed", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    const scored = scoreConcernBuckets(state);
    const toxin = scored.find((b) => b.id === "toxin_exposure_pattern");

    expect(toxin).toBeDefined();
    expect(toxin!.score).toBeGreaterThanOrEqual(35);
    expect(toxin!.mustNotMiss).toBe(true);
  });
});

describe("Scoring: urinary obstruction", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("scores urinary straining/no output into urinary_obstruction_pattern", () => {
    state = updateRedFlagStatus(state, "urinary_blockage", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    const scored = scoreConcernBuckets(state);
    const urinary = scored.find((b) => b.id === "urinary_obstruction_pattern");

    expect(urinary).toBeDefined();
    expect(urinary!.score).toBeGreaterThanOrEqual(35);
    expect(urinary!.mustNotMiss).toBe(true);
  });
});

describe("Scoring: seizure/neuro", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("scores seizure signals into seizure_neuro_pattern", () => {
    state = updateRedFlagStatus(state, "seizure_activity", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    const scored = scoreConcernBuckets(state);
    const neuro = scored.find((b) => b.id === "seizure_neuro_pattern");

    expect(neuro).toBeDefined();
    expect(neuro!.score).toBeGreaterThanOrEqual(35);
    expect(neuro!.mustNotMiss).toBe(true);
  });
});

describe("Scoring: mild skin symptoms", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("scores mild skin symptoms into routine_mild_skin without emergency escalation", () => {
    state = recordAnsweredQuestion(state, "q1", "excessive_scratching", "yes");
    state = recordAnsweredQuestion(state, "q2", "skin_changes", "mild_redness");

    const scored = scoreConcernBuckets(state);
    const mildSkin = scored.find((b) => b.id === "routine_mild_skin");

    expect(mildSkin).toBeDefined();
    expect(mildSkin!.score).toBeGreaterThan(0);
    expect(mildSkin!.mustNotMiss).toBe(false);

    const emergencySkin = scored.find((b) => b.id === "skin_allergy_emergency");
    expect(emergencySkin).toBeDefined();
    expect(emergencySkin!.mustNotMiss).toBe(true);
  });
});

describe("Scoring: mild limp", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("scores mild limp into routine_mild_limp without emergency escalation", () => {
    state = recordAnsweredQuestion(state, "q1", "limping", "yes");
    state = recordAnsweredQuestion(state, "q2", "weight_bearing", "partial");

    const scored = scoreConcernBuckets(state);
    const mildLimp = scored.find((b) => b.id === "routine_mild_limp");

    expect(mildLimp).toBeDefined();
    expect(mildLimp!.score).toBeGreaterThan(0);
    expect(mildLimp!.mustNotMiss).toBe(false);
  });
});

describe("Scoring: clinical signals", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("scores matching clinical signals into the correct bucket", () => {
    const signal: ClinicalSignal = {
      id: "possible_breathing_difficulty",
      type: "possible_breathing_difficulty",
      severity: "high",
      evidenceText: "AI detected respiratory distress from owner description",
      turnDetected: 1,
    };

    state = addClinicalSignal(state, signal);

    const scored = scoreConcernBuckets(state);
    const breathing = scored.find((b) => b.id === "emergency_airway_breathing");

    expect(breathing).toBeDefined();
    expect(breathing!.score).toBeGreaterThanOrEqual(20);
    expect(breathing!.evidence.some((e) => e.includes("Clinical signal"))).toBe(true);
  });

  it("uses detector-aligned signal ids for scoring", () => {
    const signal: ClinicalSignal = {
      id: "possible_bloat_gdv",
      type: "possible_bloat_gdv",
      severity: "critical",
      evidenceText: "AI detected distended abdomen pattern",
      turnDetected: 1,
    };

    state = addClinicalSignal(state, signal);

    const scored = scoreConcernBuckets(state);
    const bloat = scored.find((bucket) => bucket.id === "bloat_gdv_pattern");

    expect(bloat).toBeDefined();
    expect(bloat!.score).toBeGreaterThanOrEqual(20);
  });
});

describe("Scoring: scores are clamped", () => {
  it("scores are clamped to 0-100 range", () => {
    let state = createInitialClinicalCaseState();

    for (let i = 0; i < 10; i++) {
      state = updateRedFlagStatus(state, `flag_${i}`, {
        status: "positive",
        source: "explicit_answer",
        turn: i + 1,
      });
    }

    const scored = scoreConcernBuckets(state);

    for (const bucket of scored) {
      expect(bucket.score).toBeGreaterThanOrEqual(0);
      expect(bucket.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("Urgency safety: emergency is never downgraded", () => {
  it("positive emergency urgency is never downgraded after bucket merge", () => {
    let state = createInitialClinicalCaseState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    expect(state.currentUrgency).toBe("emergency");

    const merged = mergeConcernBucketsIntoCaseState(state);

    expect(merged.currentUrgency).toBe("emergency");
  });
});

describe("Negative red flag does not override positive", () => {
  it("negative red flag does not override a different positive red flag", () => {
    let state = createInitialClinicalCaseState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });
    state = updateRedFlagStatus(state, "breathing_difficulty", {
      status: "negative",
      source: "explicit_answer",
      turn: 2,
    });

    const scored = scoreConcernBuckets(state);
    const breathing = scored.find((b) => b.id === "emergency_airway_breathing");

    expect(breathing).toBeDefined();
    expect(breathing!.score).toBeGreaterThanOrEqual(35);
  });
});

describe("Explicit answers only score when they support the concern", () => {
  it("does not score reassuring breathing answers as emergency evidence", () => {
    let state = createInitialClinicalCaseState();
    state = recordAnsweredQuestion(state, "q1", "gum_color", "pink_normal");
    state = recordAnsweredQuestion(state, "q2", "difficulty_breathing", "no");

    const scored = scoreConcernBuckets(state);
    const breathing = scored.find((bucket) => bucket.id === "emergency_airway_breathing");

    expect(breathing).toBeDefined();
    expect(breathing!.score).toBe(5);
    expect(breathing!.evidence).toEqual([
      "Must-not-miss bucket with unresolved red flags — kept at low score",
    ]);
  });
});

describe("Suggested question IDs", () => {
  it("suggested question IDs are preserved in scored buckets", () => {
    let state = createInitialClinicalCaseState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    const scored = scoreConcernBuckets(state);
    const breathing = scored.find((b) => b.id === "emergency_airway_breathing");

    expect(breathing).toBeDefined();
    expect(breathing!.suggestedQuestionIds).toHaveLength(2);
    expect(breathing!.suggestedQuestionIds).toContain("breathing_difficulty_check");
    expect(breathing!.suggestedQuestionIds).toContain("gum_color_check");
  });
});

describe("No owner-facing diagnosis/treatment language", () => {
  it("no bucket definition contains diagnosis/treatment claims", () => {
    const definitions = getConcernBucketDefinitions();
    const forbiddenWords = [
      "diagnose",
      "diagnosis",
      "treat",
      "treatment",
      "cure",
      "medication",
      "prescription",
      "antibiotic",
      "steroid",
      "surgery",
    ];

    for (const def of definitions) {
      const combinedText = `${def.labelForLogs} ${def.id}`.toLowerCase();
      for (const word of forbiddenWords) {
        expect(combinedText).not.toContain(word.toLowerCase());
      }
    }
  });
});

describe("getTopConcernBuckets", () => {
  it("sorts by score descending", () => {
    let state = createInitialClinicalCaseState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });
    state = updateRedFlagStatus(state, "unproductive_retching", {
      status: "positive",
      source: "explicit_answer",
      turn: 2,
    });
    state = recordAnsweredQuestion(state, "q1", "excessive_scratching", "yes");

    const top = getTopConcernBuckets(state, 3);

    expect(top.length).toBeLessThanOrEqual(3);
    for (let i = 0; i < top.length - 1; i++) {
      expect(top[i].score).toBeGreaterThanOrEqual(top[i + 1].score);
    }
  });

  it("respects the limit parameter", () => {
    let state = createInitialClinicalCaseState();

    for (let i = 0; i < 10; i++) {
      state = updateRedFlagStatus(state, `flag_${i}`, {
        status: "positive",
        source: "explicit_answer",
        turn: i + 1,
      });
    }

    const top = getTopConcernBuckets(state, 2);

    expect(top.length).toBeLessThanOrEqual(2);
  });

  it("filters out zero-score buckets", () => {
    const state = createInitialClinicalCaseState();

    const top = getTopConcernBuckets(state);

    for (const bucket of top) {
      expect(bucket.score).toBeGreaterThan(0);
    }
  });
});

describe("hasMustNotMissConcern", () => {
  it("detects high-risk buckets when must-not-miss bucket has score > 0", () => {
    let state = createInitialClinicalCaseState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    expect(hasMustNotMissConcern(state)).toBe(true);
  });

  it("returns false when no must-not-miss bucket has a score", () => {
    const state = createInitialClinicalCaseState();

    expect(hasMustNotMissConcern(state)).toBe(false);
  });

  it("returns false when only non-must-not-miss buckets have scores", () => {
    let state = createInitialClinicalCaseState();
    state = recordAnsweredQuestion(state, "q1", "excessive_scratching", "yes");

    expect(hasMustNotMissConcern(state)).toBe(false);
  });
});

describe("mergeConcernBucketsIntoCaseState", () => {
  it("populates concernBuckets on the case state", () => {
    let state = createInitialClinicalCaseState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    const merged = mergeConcernBucketsIntoCaseState(state);

    expect(merged.concernBuckets.length).toBeGreaterThan(0);
    const breathing = merged.concernBuckets.find((b) => b.id === "emergency_airway_breathing");
    expect(breathing).toBeDefined();
    expect(breathing!.score).toBeGreaterThan(0);
  });

  it("does not include zero-score buckets in concernBuckets", () => {
    const state = createInitialClinicalCaseState();

    const merged = mergeConcernBucketsIntoCaseState(state);

    for (const bucket of merged.concernBuckets) {
      expect(bucket.score).toBeGreaterThan(0);
    }
  });

  it("preserves all other case state fields", () => {
    let state = createInitialClinicalCaseState("gi");
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    const merged = mergeConcernBucketsIntoCaseState(state);

    expect(merged.species).toBe("dog");
    expect(merged.activeComplaintModule).toBe("gi");
    expect(merged.currentUrgency).toBe("emergency");
    expect(merged.explicitAnswers).toEqual({});
  });
});

describe("Unknown emergency slots keep must-not-miss bucket present", () => {
  it("must-not-miss bucket with unknown red flags stays at low score", () => {
    let state = createInitialClinicalCaseState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "unknown",
      source: "unset",
      turn: 0,
    });

    const scored = scoreConcernBuckets(state);
    const breathing = scored.find((b) => b.id === "emergency_airway_breathing");

    expect(breathing).toBeDefined();
    expect(breathing!.score).toBeGreaterThanOrEqual(5);
  });

  it("keeps the bucket visible when some red flags are answered negative but others remain unresolved", () => {
    let state = createInitialClinicalCaseState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "negative",
      source: "explicit_answer",
      turn: 1,
    });

    const scored = scoreConcernBuckets(state);
    const breathing = scored.find((bucket) => bucket.id === "emergency_airway_breathing");

    expect(breathing).toBeDefined();
    expect(breathing!.score).toBe(5);
    expect(breathing!.evidence).toContain(
      "Must-not-miss bucket with unresolved red flags — kept at low score"
    );
  });
});
