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

export function getUrgencyLevelLabel(report: SymptomReport): string {
  switch (report.recommendation) {
    case "emergency_vet":
      return "Emergency care now";
    case "vet_24h":
      return "Same-day veterinary visit";
    case "vet_48h":
      return "Veterinary visit within 48 hours";
    default:
      return "Home monitoring for now";
  }
}

export function getUrgencyLevelBody(report: SymptomReport): string {
  switch (report.recommendation) {
    case "emergency_vet":
      return "Use the next-step cards below first, then bring or share the clinic handoff with the veterinary team.";
    case "vet_24h":
      return "Use the next-step cards below, then call or visit a clinic today and keep this report handy.";
    case "vet_48h":
      return "Follow the next-step cards below and arrange follow-up soon if the problem continues or gets worse.";
    default:
      return "Start with the next-step cards below and watch for the warning signs that would change this plan.";
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
