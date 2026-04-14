import type { SymptomReport } from "@/components/symptom-report/types";

export function isEmergencyReport(report: SymptomReport): boolean {
  return (
    report.recommendation === "emergency_vet" ||
    report.severity === "emergency"
  );
}

export function isEscalatedReport(report: SymptomReport): boolean {
  return (
    isEmergencyReport(report) ||
    report.recommendation === "vet_24h" ||
    report.severity === "high"
  );
}

export function getRecommendationLabel(report: SymptomReport): string {
  switch (report.recommendation) {
    case "emergency_vet":
      return "Seek emergency veterinary care immediately";
    case "vet_24h":
      return "Arrange a veterinary visit within 24 hours";
    case "vet_48h":
      return "Arrange a veterinary visit within 48 hours";
    default:
      return "Monitor at home with the guidance below";
  }
}

function topDifferentials(report: SymptomReport): string[] {
  return (report.differential_diagnoses || [])
    .slice(0, 3)
    .map((entry) => entry.condition.trim())
    .filter(Boolean);
}

function topTests(report: SymptomReport): string[] {
  return (report.recommended_tests || [])
    .slice(0, 3)
    .map((entry) => entry.test.trim())
    .filter(Boolean);
}

function section(title: string, body: string | string[] | null): string {
  if (!body) return "";
  if (Array.isArray(body)) {
    if (body.length === 0) return "";
    return `${title}\n${body.map((line) => `- ${line}`).join("\n")}`;
  }

  const trimmed = body.trim();
  return trimmed ? `${title}\n${trimmed}` : "";
}

export function buildVetHandoffPacket(report: SymptomReport): string {
  const packetTitle = isEmergencyReport(report)
    ? "PawVital Emergency Vet Handoff"
    : isEscalatedReport(report)
      ? "PawVital Urgent Vet Handoff"
      : "PawVital Vet Handoff";

  const parts = [
    packetTitle,
    `Clinical title: ${report.title}`,
    `Recommendation: ${getRecommendationLabel(report)}`,
    section("Vet handoff summary", report.vet_handoff_summary || report.explanation),
    section("Top differentials", topDifferentials(report)),
    section("Recommended diagnostics", topTests(report)),
    section("Escalate immediately if", report.warning_signs || []),
  ].filter(Boolean);

  return parts.join("\n\n");
}

export function getDefaultClinicLinkExpiry(
  report: SymptomReport
): "24h" | "7d" | "30d" {
  return isEscalatedReport(report) ? "24h" : "7d";
}
