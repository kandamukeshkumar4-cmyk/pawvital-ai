import type { SymptomReport } from "./types";

export type ReportTone = "emergency" | "urgent" | "routine";
export type ShareExpiryOption = "24h" | "7d" | "30d";

export interface HeaderBannerCopy {
  helper: string;
  title: string;
}

export interface ReportPresentation {
  actionTitle: string;
  defaultExpiry: ShareExpiryOption;
  downloadLabel: string;
  headerBanner: HeaderBannerCopy | null;
  limitations: string[];
  recommendationLabel: string;
  shareButtonLabel: string;
  shareDescription: string;
  shareModalTitle: string;
  sharePrimaryLabel: string;
  tone: ReportTone;
  urgencyBody: string;
  urgencyLabel: string;
  vetHandoffIntro: string;
  vetHandoffPacket: string;
  warningTitle: string;
}

const DEFAULT_LIMITATIONS = [
  "PawVital cannot replace a hands-on veterinary exam.",
  "A veterinarian should confirm the cause and safest next steps for your dog.",
];

const RECOMMENDATION_COPY: Record<
  SymptomReport["recommendation"],
  Omit<ReportPresentation, "limitations" | "vetHandoffPacket">
> = {
  emergency_vet: {
    actionTitle: "Do this now",
    defaultExpiry: "24h",
    downloadLabel: "Download Clinic PDF",
    headerBanner: {
      helper:
        "Leave now if you can travel safely. Call the clinic on the way and use the clinic handoff below at intake.",
      title: "Emergency clinic handoff",
    },
    recommendationLabel: "Seek emergency veterinary care immediately",
    shareButtonLabel: "Share Clinic Link",
    shareDescription:
      "Create a read-only clinic link you can hand to intake staff or text to the veterinary team before you arrive.",
    shareModalTitle: "Share clinic link",
    sharePrimaryLabel: "Create clinic link",
    tone: "emergency",
    urgencyBody:
      "Use the next-step cards below first, then bring or share the clinic handoff with the veterinary team.",
    urgencyLabel: "Emergency care now",
    vetHandoffIntro: "Front-desk ready summary for urgent intake or triage.",
    warningTitle: "Get urgent help even faster if you notice",
  },
  monitor: {
    actionTitle: "What to do now",
    defaultExpiry: "7d",
    downloadLabel: "Download PDF",
    headerBanner: null,
    recommendationLabel: "Monitor at home with the guidance below",
    shareButtonLabel: "Share with Vet",
    shareDescription:
      "Anyone with the link can view this report until it expires. Links are read-only.",
    shareModalTitle: "Share with your veterinarian",
    sharePrimaryLabel: "Generate link",
    tone: "routine",
    urgencyBody:
      "Start with the next-step cards below and watch for the warning signs that would change this plan.",
    urgencyLabel: "Home monitoring for now",
    vetHandoffIntro:
      "Quick summary to copy into a message or intake form for your veterinarian.",
    warningTitle: "Contact a veterinarian sooner if you notice",
  },
  vet_24h: {
    actionTitle: "What to do now",
    defaultExpiry: "24h",
    downloadLabel: "Download Clinic PDF",
    headerBanner: {
      helper:
        "Arrange same-day veterinary follow-up and copy the clinic handoff before you leave.",
      title: "Same-day veterinary follow-up",
    },
    recommendationLabel: "Arrange a veterinary visit within 24 hours",
    shareButtonLabel: "Share Clinic Link",
    shareDescription:
      "Create a read-only clinic link you can hand to intake staff or text to the veterinary team before you arrive.",
    shareModalTitle: "Share clinic link",
    sharePrimaryLabel: "Create clinic link",
    tone: "urgent",
    urgencyBody:
      "Use the next-step cards below, then call or visit a clinic today and keep this report handy.",
    urgencyLabel: "Same-day veterinary visit",
    vetHandoffIntro: "Front-desk ready summary for urgent intake or triage.",
    warningTitle: "Get urgent help sooner if you notice",
  },
  vet_48h: {
    actionTitle: "What to do now",
    defaultExpiry: "7d",
    downloadLabel: "Download PDF",
    headerBanner: null,
    recommendationLabel: "Arrange a veterinary visit within 48 hours",
    shareButtonLabel: "Share with Vet",
    shareDescription:
      "Anyone with the link can view this report until it expires. Links are read-only.",
    shareModalTitle: "Share with your veterinarian",
    sharePrimaryLabel: "Generate link",
    tone: "routine",
    urgencyBody:
      "Follow the next-step cards below and arrange follow-up soon if the problem continues or gets worse.",
    urgencyLabel: "Veterinary visit within 48 hours",
    vetHandoffIntro:
      "Quick summary to copy into a message or intake form for your veterinarian.",
    warningTitle: "Contact a veterinarian sooner if you notice",
  },
};

function cleanText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function cleanList(items: string[] | undefined): string[] {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

function listSection(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return `${title}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function textSection(title: string, body: string): string {
  return body ? `${title}\n${body}` : "";
}

function topDifferentialLines(report: SymptomReport): string[] {
  return (report.differential_diagnoses ?? [])
    .slice(0, 3)
    .map((entry) => entry.condition.trim())
    .filter(Boolean);
}

function topRecommendedTests(report: SymptomReport): string[] {
  return (report.recommended_tests ?? [])
    .slice(0, 3)
    .map((entry) => entry.test.trim())
    .filter(Boolean);
}

function buildVetHandoffPacket(
  report: SymptomReport,
  recommendationLabel: string,
): string {
  const title =
    report.recommendation === "emergency_vet"
      ? "PawVital Emergency Vet Handoff"
      : report.recommendation === "vet_24h"
        ? "PawVital Urgent Vet Handoff"
        : "PawVital Vet Handoff";
  const summary = cleanText(report.vet_handoff_summary) || cleanText(report.explanation);

  return [
    title,
    `Clinical title: ${cleanText(report.title)}`,
    `Recommendation: ${recommendationLabel}`,
    textSection("Vet handoff summary", summary),
    listSection("Top differentials", topDifferentialLines(report)),
    listSection("Recommended diagnostics", topRecommendedTests(report)),
    listSection("Escalate immediately if", cleanList(report.warning_signs)),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function resolveLimitations(report: SymptomReport): string[] {
  const reportLimitations = cleanList(report.limitations);
  return reportLimitations.length > 0 ? reportLimitations : DEFAULT_LIMITATIONS;
}

export function buildReportPresentation(
  report: SymptomReport,
): ReportPresentation {
  const copy = RECOMMENDATION_COPY[report.recommendation];

  return {
    ...copy,
    limitations: resolveLimitations(report),
    vetHandoffPacket: buildVetHandoffPacket(report, copy.recommendationLabel),
  };
}
