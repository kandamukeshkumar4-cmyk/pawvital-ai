import { summarizeDailyLogsForContext } from "@/lib/health-log/context";
import type { HealthLog } from "@/lib/health-log/types";
import { buildVetTimeline } from "@/lib/analytics/vet-timeline";
import type { SymptomCheckEntry } from "@/components/timeline/types";
import type { JournalEntry } from "@/types/journal";
import { detectDogBrainSignals } from "@/lib/dog-brain/signals";
import {
  brainPrioritySymptomsFromSignals,
  brainPrioritySymptomEvidence,
} from "@/lib/dog-brain/question-priority";

/** Minimal HealthLog factory */
function log(overrides: Partial<HealthLog> = {}): HealthLog {
  return {
    id: overrides.id ?? "l1",
    user_id: "u1",
    pet_id: "p1",
    log_date: overrides.log_date ?? "2026-06-18",
    appetite: overrides.appetite ?? "normal",
    water: overrides.water ?? "normal",
    stool: overrides.stool ?? "normal",
    urination: overrides.urination ?? "normal",
    vomiting_count: overrides.vomiting_count ?? 0,
    energy: overrides.energy ?? "normal",
    weight_kg: overrides.weight_kg ?? null,
    meds_given: overrides.meds_given ?? false,
    notes: overrides.notes ?? null,
    photo_urls: overrides.photo_urls ?? [],
    context_signals: overrides.context_signals ?? null,
    created_at: "2026-06-18T08:00:00.000Z",
    updated_at: "2026-06-18T08:00:00.000Z",
  };
}

function check(overrides: Partial<SymptomCheckEntry> = {}): SymptomCheckEntry {
  return {
    id: overrides.id ?? "c1",
    pet_id: "p1",
    pet_name: "Bruno",
    created_at: overrides.created_at ?? "2026-06-18T10:00:00.000Z",
    primary_symptom: overrides.primary_symptom ?? "Vomiting",
    severity: overrides.severity ?? "moderate",
    urgency: overrides.urgency ?? "monitor",
    top_diagnosis: "x",
    confidence: 0.8,
  };
}

function journal(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: overrides.id ?? "j1",
    user_id: "u1",
    pet_id: "p1",
    entry_date: overrides.entry_date ?? "2026-06-18",
    mood: overrides.mood ?? null,
    energy_level: null,
    notes: overrides.notes ?? null,
    ai_summary: null,
    photo_urls: overrides.photo_urls ?? [],
    created_at: "2026-06-18T08:00:00.000Z",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Context string safety
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeDailyLogsForContext — Dog Brain context contract", () => {
  it("always carries the non-override disclaimer", () => {
    const out = summarizeDailyLogsForContext([log()], "Bruno");
    expect(out.toLowerCase()).toContain("do not override clinical assessment");
  });

  it("labels output as owner-reported, not clinical", () => {
    const out = summarizeDailyLogsForContext(
      [log({ appetite: "none", vomiting_count: 3 })],
      "Bruno",
    );
    expect(out.toLowerCase()).toContain("owner-reported observations");
    expect(out.toLowerCase()).toContain("not clinical measurements");
  });

  it("never uses diagnostic language", () => {
    const out = summarizeDailyLogsForContext(
      [log({ stool: "blood", vomiting_count: 5, appetite: "none" })],
      "Bruno",
    );
    expect(out.toLowerCase()).not.toMatch(/diagnos|likely has|likely disease|gastro/);
  });

  it("medication context is logged as history, not dosing guidance", () => {
    const out = summarizeDailyLogsForContext(
      [log({ meds_given: true })],
      "Bruno",
    );
    expect(out.toLowerCase()).toContain("medication");
    // Must NOT contain dosing or prescription language.
    expect(out.toLowerCase()).not.toMatch(/dose|mg|prescri|give .* mg|administer/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Red flag escalation: normal recent logs must NOT lower urgency
// ─────────────────────────────────────────────────────────────────────────────

describe("Dog Brain context does not interfere with clinical urgency", () => {
  it("context string is supportive only — no urgency claim", () => {
    const recentNormalLogs = [
      log({ log_date: "2026-06-18" }),
      log({ log_date: "2026-06-17" }),
      log({ log_date: "2026-06-16" }),
    ];
    const out = summarizeDailyLogsForContext(recentNormalLogs, "Bruno");
    // Must not claim urgency or emergency status.
    expect(out.toLowerCase()).not.toMatch(/emergency|urgent|call vet|vet now/);
    // Must still carry the non-override disclaimer.
    expect(out.toLowerCase()).toContain("do not override clinical assessment");
  });

  it("even severe logs in context carry the non-override disclaimer", () => {
    const severeLogs = [
      log({ stool: "blood", vomiting_count: 5, urination: "none" }),
    ];
    const out = summarizeDailyLogsForContext(severeLogs, "Bruno");
    expect(out.toLowerCase()).toContain("supportive context only");
    expect(out.toLowerCase()).toContain("do not override clinical assessment");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// context_signals pack support
// ─────────────────────────────────────────────────────────────────────────────

describe("ContextSignals in HealthLog", () => {
  it("logs accept context_signals without type error", () => {
    const l = log({
      context_signals: {
        gi: { blood_in_stool: true },
        medication: { name: "Metronidazole", dose_notes: "per vet" },
      },
    });
    expect(l.context_signals?.gi?.blood_in_stool).toBe(true);
    expect(l.context_signals?.medication?.name).toBe("Metronidazole");
  });

  it("context_signals null when not provided", () => {
    const l = log();
    expect(l.context_signals).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dog Brain priority-symptom evidence (the data threaded into DogBrainContextData
// alongside prioritySymptoms — same detector the context loader uses internally).
// ─────────────────────────────────────────────────────────────────────────────

describe("brainPrioritySymptomEvidence from detected signals", () => {
  it("produces evidence keyed by the SAME priority symptoms the loader threads out", () => {
    const logs = [
      log({ log_date: "2026-06-18", stool: "diarrhea" }),
      log({ log_date: "2026-06-17", stool: "diarrhea" }),
      log({ log_date: "2026-06-16", stool: "soft" }),
    ];
    const signals = detectDogBrainSignals(logs).signals;
    const prioritySymptoms = brainPrioritySymptomsFromSignals(signals);
    const evidence = brainPrioritySymptomEvidence(signals);

    expect(prioritySymptoms).toContain("diarrhea");
    // Every priority symptom that carries evidence references a real signal_type
    // and an owner-friendly (non-diagnostic) summary.
    expect(evidence["diarrhea"]?.signal_type).toBe("stool_change");
    expect(evidence["diarrhea"]?.evidence_summary).toBeTruthy();
    expect(evidence["diarrhea"]?.evidence_summary).not.toMatch(
      /diagnos|disease|cancer/i,
    );
  });

  it("empty logs ⇒ no priority symptoms AND no evidence (no-op shape)", () => {
    const signals = detectDogBrainSignals([]).signals;
    expect(brainPrioritySymptomsFromSignals(signals)).toEqual([]);
    expect(brainPrioritySymptomEvidence(signals)).toEqual({});
  });

  it("all-normal logs ⇒ no evidence (no Brain memory ⇒ byte-identical no-op)", () => {
    const normalLogs = [
      log({ log_date: "2026-06-18" }),
      log({ log_date: "2026-06-17" }),
      log({ log_date: "2026-06-16" }),
    ];
    const signals = detectDogBrainSignals(normalLogs).signals;
    expect(brainPrioritySymptomEvidence(signals)).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Vet Timeline builder
// ─────────────────────────────────────────────────────────────────────────────

describe("buildVetTimeline", () => {
  it("returns empty entries for all-empty inputs", () => {
    const result = buildVetTimeline({ checks: [], logs: [], journal: [], petName: "Bruno" });
    expect(result.entries).toHaveLength(0);
    expect(result.vetSummary).toContain("No recent signs");
  });

  it("includes symptom checks in the timeline", () => {
    const result = buildVetTimeline({
      checks: [check({ primary_symptom: "Vomiting", urgency: "urgent" })],
      logs: [],
      journal: [],
      petName: "Bruno",
    });
    const sc = result.entries.find((e) => e.source === "symptom_check");
    expect(sc).toBeDefined();
    expect(sc?.summary).toContain("Vomiting");
    expect(sc?.tone).toBe("alert");
  });

  it("includes daily logs — off-normal only gets changed/alert tone", () => {
    const result = buildVetTimeline({
      checks: [],
      logs: [log({ stool: "diarrhea", appetite: "reduced" })],
      journal: [],
      petName: "Bruno",
    });
    const dl = result.entries.find((e) => e.source === "daily_log");
    expect(dl).toBeDefined();
    expect(dl?.tone).not.toBe("normal");
  });

  it("normal log is included with normal tone", () => {
    const result = buildVetTimeline({
      checks: [],
      logs: [log()],
      journal: [],
      petName: "Bruno",
    });
    const dl = result.entries.find((e) => e.source === "daily_log");
    expect(dl?.tone).toBe("normal");
    expect(dl?.summary).toContain("all signs normal");
  });

  it("includes journal entries with notes", () => {
    const result = buildVetTimeline({
      checks: [],
      logs: [],
      journal: [journal({ notes: "Bruno seemed tired today", mood: "low" })],
      petName: "Bruno",
    });
    const je = result.entries.find((e) => e.source === "journal");
    expect(je).toBeDefined();
    expect(je?.summary).toContain("tired today");
    expect(je?.tone).toBe("changed");
  });

  it("skips journal entries with no notes and no photos", () => {
    const result = buildVetTimeline({
      checks: [],
      logs: [],
      journal: [journal({ notes: null, photo_urls: [] })],
      petName: "Bruno",
    });
    expect(result.entries.filter((e) => e.source === "journal")).toHaveLength(0);
  });

  it("extracts recurring symptoms from multiple checks", () => {
    const result = buildVetTimeline({
      checks: [
        check({ id: "c1", created_at: "2026-06-16T10:00:00Z", primary_symptom: "Vomiting" }),
        check({ id: "c2", created_at: "2026-06-17T10:00:00Z", primary_symptom: "Vomiting" }),
        check({ id: "c3", created_at: "2026-06-18T10:00:00Z", primary_symptom: "Lethargy" }),
      ],
      logs: [],
      journal: [],
      petName: "Bruno",
    });
    expect(result.recurringSymptoms).toContain("vomiting");
    expect(result.recurringSymptoms).not.toContain("lethargy");
  });

  it("medication source appears when meds_given is true", () => {
    const result = buildVetTimeline({
      checks: [],
      logs: [log({ meds_given: true })],
      journal: [],
      petName: "Bruno",
    });
    const med = result.entries.find((e) => e.source === "medication");
    expect(med).toBeDefined();
    expect(med?.summary).toContain("history only — not dosing advice");
  });

  it("medication named via context_signals appears in summary", () => {
    const result = buildVetTimeline({
      checks: [],
      logs: [
        log({
          meds_given: true,
          context_signals: { medication: { name: "Rimadyl" } },
        }),
      ],
      journal: [],
      petName: "Bruno",
    });
    const med = result.entries.find((e) => e.source === "medication");
    expect(med?.summary).toContain("Rimadyl");
  });

  it("returns source labels on every entry", () => {
    const result = buildVetTimeline({
      checks: [check()],
      logs: [log()],
      journal: [journal({ notes: "test note" })],
      petName: "Bruno",
    });
    for (const e of result.entries) {
      expect(["symptom_check", "daily_log", "journal", "medication"]).toContain(e.source);
    }
  });

  it("entries are sorted newest-first", () => {
    const result = buildVetTimeline({
      checks: [
        check({ id: "c1", created_at: "2026-06-10T10:00:00Z" }),
        check({ id: "c2", created_at: "2026-06-18T10:00:00Z" }),
      ],
      logs: [log({ log_date: "2026-06-15" })],
      journal: [],
      petName: "Bruno",
    });
    const dates = result.entries.map((e) => e.date);
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i] >= dates[i + 1]).toBe(true);
    }
  });

  it("logNext is non-empty and contains actionable prompts", () => {
    const result = buildVetTimeline({
      checks: [check({ urgency: "urgent" })],
      logs: [],
      journal: [],
      petName: "Bruno",
    });
    expect(result.logNext.length).toBeGreaterThan(0);
    expect(result.logNext[0].length).toBeGreaterThan(10);
  });
});
