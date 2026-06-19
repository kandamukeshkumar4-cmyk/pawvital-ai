import { buildHealthBoard } from "@/lib/analytics/health-board";
import type { SymptomCheckEntry } from "@/components/timeline/types";
import type { HealthLog } from "@/lib/health-log/types";

const NOW = new Date("2026-06-18T12:00:00");

function check(o: Partial<SymptomCheckEntry> = {}): SymptomCheckEntry {
  return {
    id: o.id ?? "c1",
    pet_id: o.pet_id ?? "p1",
    pet_name: o.pet_name ?? "Bruno",
    created_at: o.created_at ?? "2026-06-17T09:42:00.000Z",
    primary_symptom: o.primary_symptom ?? "Vomiting and diarrhea",
    severity: o.severity ?? "serious",
    urgency: o.urgency ?? "urgent",
    top_diagnosis: o.top_diagnosis ?? "Gastroenteritis",
    confidence: o.confidence ?? 0.8,
  };
}

function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function log(n: number, o: Partial<HealthLog> = {}): HealthLog {
  return {
    id: o.id ?? `l${n}`,
    user_id: "u1",
    pet_id: "p1",
    log_date: o.log_date ?? daysAgo(n),
    appetite: o.appetite ?? "normal",
    water: o.water ?? "normal",
    stool: o.stool ?? "normal",
    urination: o.urination ?? "normal",
    vomiting_count: o.vomiting_count ?? 0,
    energy: o.energy ?? "normal",
    weight_kg: o.weight_kg ?? null,
    meds_given: o.meds_given ?? false,
    notes: o.notes ?? null,
    photo_urls: o.photo_urls ?? [],
    context_signals: o.context_signals ?? null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

describe("buildHealthBoard — empty state", () => {
  it("returns a usable empty model with no checks or logs", () => {
    const board = buildHealthBoard({ checks: [], logs: [], now: NOW, fallbackPetName: "Bruno" });
    expect(board.petName).toBe("Bruno");
    expect(board.lastCheckedLabel).toBeNull();
    expect(board.changedFromNormal).toEqual([]);
    expect(board.evidence).toEqual({ symptomChecks: 0, dailyLogs: 0, photos: 0 });
    expect(board.grid.hasData).toBe(false);
    expect(board.timeline).toEqual([]);
    // Next-best-log always offers a sensible default.
    expect(board.nextBestLog.title.length).toBeGreaterThan(0);
  });
});

describe("buildHealthBoard — single check only", () => {
  it("counts the check, builds a verdictless grid, and a last-checked line", () => {
    const board = buildHealthBoard({
      checks: [check({ created_at: "2026-06-17T09:42:00.000Z" })],
      logs: [],
      now: NOW,
      fallbackPetName: "Bruno",
    });
    expect(board.evidence.symptomChecks).toBe(1);
    expect(board.evidence.dailyLogs).toBe(0);
    expect(board.grid.hasData).toBe(false);
    expect(board.lastCheckedLabel).toContain("Jun");
    // Timeline carries the check with its plain-language detail.
    expect(board.timeline).toHaveLength(1);
    expect(board.timeline[0].source).toBe("symptom_check");
  });
});

describe("buildHealthBoard — multi-day daily logs", () => {
  const logs = [
    log(4, { appetite: "normal", stool: "normal", energy: "normal", weight_kg: 12.5 }),
    log(3, { appetite: "reduced", stool: "soft", energy: "normal", weight_kg: 12.4 }),
    log(2, { appetite: "reduced", stool: "diarrhea", energy: "low", vomiting_count: 1, weight_kg: 12.3, photo_urls: ["x"] }),
    log(1, { appetite: "reduced", stool: "diarrhea", energy: "low", meds_given: true, weight_kg: 12.3 }),
    log(0, { appetite: "reduced", stool: "diarrhea", energy: "low", weight_kg: 12.4 }),
  ];

  it("fills the 7-day grid with the right tones", () => {
    const board = buildHealthBoard({ checks: [], logs, now: NOW, fallbackPetName: "Bruno" });
    expect(board.grid.hasData).toBe(true);
    expect(board.grid.days).toHaveLength(7);
    expect(board.grid.days[6].isToday).toBe(true);

    const stool = board.grid.rows.find((r) => r.key === "stool")!;
    const today = stool.cells.find((c) => c.date === daysAgo(0))!;
    expect(today.label).toBe("Diarrhea");
    expect(today.tone).toBe("alert");
  });

  it("detects a worsening change on signals that decline", () => {
    const board = buildHealthBoard({ checks: [], logs, now: NOW, fallbackPetName: "Bruno" });
    const stool = board.grid.rows.find((r) => r.key === "stool")!;
    expect(stool.change).toBe("worse");
  });

  it("surfaces changed-from-normal from the most recent log", () => {
    const board = buildHealthBoard({ checks: [], logs, now: NOW, fallbackPetName: "Bruno" });
    const labels = board.changedFromNormal.map((c) => c.label);
    expect(labels).toContain("Appetite");
    expect(labels).toContain("Stool");
    expect(labels).toContain("Energy");
    const appetite = board.changedFromNormal.find((c) => c.label === "Appetite")!;
    expect(appetite.arrow).toBe("down");
  });

  it("counts evidence including photos", () => {
    const board = buildHealthBoard({ checks: [check()], logs, now: NOW, fallbackPetName: "Bruno" });
    expect(board.evidence.symptomChecks).toBe(1);
    expect(board.evidence.dailyLogs).toBe(5);
    expect(board.evidence.photos).toBe(1);
  });

  it("builds owner-language vet bullets and copy text", () => {
    const board = buildHealthBoard({ checks: [check()], logs, now: NOW, fallbackPetName: "Bruno" });
    const joined = board.vetPacket.bullets.join(" ");
    expect(joined).toMatch(/diarrhea/i);
    expect(joined).toMatch(/appetite/i);
    expect(board.vetPacket.copyText).toContain("Bruno");
    expect(board.vetPacket.basedOn).toContain("5 daily logs");
  });

  it("recommends what to log next based on off signals", () => {
    const board = buildHealthBoard({ checks: [], logs, now: NOW, fallbackPetName: "Bruno" });
    const labels = board.logNext.map((i) => i.label.toLowerCase());
    expect(labels.some((l) => l.includes("food"))).toBe(true);
    expect(labels.some((l) => l.includes("stool"))).toBe(true);
    expect(board.logNext.every((i) => i.when === "Tonight")).toBe(true);
  });

  it("builds a weight trend marked as a measure", () => {
    const board = buildHealthBoard({ checks: [], logs, now: NOW, fallbackPetName: "Bruno" });
    const weight = board.trends.find((t) => t.key === "weight")!;
    expect(weight.isMeasure).toBe(true);
    expect(weight.points.some((p) => !p.empty)).toBe(true);
  });
});
