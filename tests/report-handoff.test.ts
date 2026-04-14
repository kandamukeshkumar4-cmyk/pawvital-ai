import type { SymptomReport } from "@/components/symptom-report/types";
import {
  buildVetHandoffPacket,
  getDefaultClinicLinkExpiry,
  isEscalatedReport,
} from "@/lib/report-handoff";

function makeReport(
  overrides: Partial<SymptomReport> = {}
): SymptomReport {
  return {
    severity: "emergency",
    recommendation: "emergency_vet",
    title: "Acute breathing distress",
    explanation: "Rapid breathing and blue gums require immediate care.",
    actions: ["Go to the emergency clinic now."],
    warning_signs: ["Collapse", "Blue or pale gums"],
    vet_handoff_summary:
      "Acute respiratory distress with cyanosis reported by owner.",
    differential_diagnoses: [
      {
        condition: "Respiratory emergency",
        description: "Requires oxygen support and immediate triage.",
        likelihood: "high",
      },
    ],
    recommended_tests: [
      {
        test: "Thoracic radiographs",
        reason: "Assess pulmonary or pleural disease",
        urgency: "stat",
      },
    ],
    ...overrides,
  };
}

describe("report handoff helpers", () => {
  it("builds an emergency clinic packet with escalation signs", () => {
    const packet = buildVetHandoffPacket(makeReport());

    expect(packet).toContain("PawVital Emergency Vet Handoff");
    expect(packet).toContain("Recommendation: Seek emergency veterinary care immediately");
    expect(packet).toContain("Vet handoff summary");
    expect(packet).toContain("Top differentials");
    expect(packet).toContain("Recommended diagnostics");
    expect(packet).toContain("Escalate immediately if");
    expect(packet).toContain("- Collapse");
  });

  it("falls back to explanation text when no dedicated handoff summary exists", () => {
    const packet = buildVetHandoffPacket(
      makeReport({ vet_handoff_summary: undefined })
    );

    expect(packet).toContain("Vet handoff summary");
    expect(packet).toContain("Rapid breathing and blue gums require immediate care.");
  });

  it("defaults clinic link expiry to 24h for escalated reports and 7d otherwise", () => {
    const emergency = makeReport();
    const routine = makeReport({
      recommendation: "monitor",
      severity: "low",
      warning_signs: [],
    });

    expect(isEscalatedReport(emergency)).toBe(true);
    expect(getDefaultClinicLinkExpiry(emergency)).toBe("24h");
    expect(isEscalatedReport(routine)).toBe(false);
    expect(getDefaultClinicLinkExpiry(routine)).toBe("7d");
  });
});
