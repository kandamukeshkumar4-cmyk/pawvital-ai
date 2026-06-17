import {
  Document,
  Page,
  View,
  Text,
} from "@react-pdf/renderer";
import type { SymptomReport } from "@/components/symptom-report/types";
import { formatConfidenceLevelLabel } from "@/lib/report-confidence";
import { brand, pdfStyles } from "./styles";
import {
  getRecommendationLabel,
  isEmergencyReport,
  isEscalatedReport,
} from "@/lib/report-handoff";

function severityBandStyle(severity: SymptomReport["severity"]) {
  switch (severity) {
    case "low":
      return {
        backgroundColor: brand.emeraldLight,
        borderColor: brand.emerald,
      };
    case "medium":
      return {
        backgroundColor: brand.amberLight,
        borderColor: brand.amber,
      };
    case "high":
      return {
        backgroundColor: brand.orangeLight,
        borderColor: brand.orange,
      };
    case "emergency":
    default:
      return {
        backgroundColor: brand.redLight,
        borderColor: brand.red,
      };
  }
}

function severityLabel(severity: SymptomReport["severity"]): string {
  switch (severity) {
    case "low":
      return "Low Concern";
    case "medium":
      return "Moderate";
    case "high":
      return "High Concern";
    case "emergency":
      return "Emergency";
    default:
      return severity;
  }
}

function likelihoodToFraction(
  likelihood: "high" | "moderate" | "low"
): number {
  if (likelihood === "high") return 0.88;
  if (likelihood === "moderate") return 0.55;
  return 0.28;
}

function likelihoodLabel(likelihood: "high" | "moderate" | "low"): string {
  if (likelihood === "high") return "Most Likely";
  if (likelihood === "moderate") return "Possible";
  return "Less Likely";
}

const URGENCY_STEPS = [
  "Monitor at home",
  "Within 48 hours",
  "Within 24 hours",
  "Emergency now",
];

function recommendationToStep(
  recommendation: SymptomReport["recommendation"]
): number {
  switch (recommendation) {
    case "monitor":
      return 0;
    case "vet_48h":
      return 1;
    case "vet_24h":
      return 2;
    case "emergency_vet":
      return 3;
    default:
      return 1;
  }
}

function severityActiveColor(severity: SymptomReport["severity"]): string {
  switch (severity) {
    case "low":
      return brand.emerald;
    case "medium":
      return brand.amber;
    case "high":
      return brand.orange;
    case "emergency":
    default:
      return brand.red;
  }
}

interface ReportPdfDocumentProps {
  report: SymptomReport;
  generatedAt: string;
  shareUrl?: string;
}

export function ReportPdfDocument({
  report,
  generatedAt,
  shareUrl,
}: ReportPdfDocumentProps) {
  const calibratedConfidence =
    report.calibrated_confidence ?? report.confidence_calibration;
  const emergencyReport = isEmergencyReport(report);
  const escalatedReport = isEscalatedReport(report);
  const band = severityBandStyle(report.severity);
  const activeStep = recommendationToStep(report.recommendation);
  const activeStepColor = severityActiveColor(report.severity);
  const dxRows =
    report.differential_diagnoses?.map((d) => ({
      condition: d.condition,
      likelihood: d.likelihood,
      description: d.description,
      fraction: likelihoodToFraction(d.likelihood),
    })) ?? [];

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={pdfStyles.logoMark} />
            <Text style={[pdfStyles.logoText, { marginLeft: 8 }]}>PawVital</Text>
          </View>
          <Text style={pdfStyles.bodySmall}>Symptom report</Text>
        </View>

        <View
          style={[
            pdfStyles.severityBand,
            { backgroundColor: band.backgroundColor, borderColor: band.borderColor },
          ]}
        >
          <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: brand.gray900 }}>
            {report.title}
          </Text>
          <Text style={[pdfStyles.badge, { backgroundColor: brand.white, color: band.borderColor }]}>
            {severityLabel(report.severity)}
          </Text>
          <Text style={[pdfStyles.body, { marginTop: 6 }]}>
            Recommendation: {getRecommendationLabel(report)}
          </Text>
          {typeof report.confidence === "number" && (
            <Text style={[pdfStyles.bodySmall, { marginTop: 4 }]}>
              Confidence: {(report.confidence * 100).toFixed(0)}%
            </Text>
          )}
          {calibratedConfidence ? (
            <Text style={[pdfStyles.bodySmall, { marginTop: 2 }]}>
              Confidence level:{" "}
              {formatConfidenceLevelLabel(
                calibratedConfidence.confidence_level
              )}
            </Text>
          ) : null}
          <View style={pdfStyles.urgencyScaleRow}>
            {URGENCY_STEPS.map((label, i) => {
              const active = i === activeStep;
              return (
                <View
                  key={label}
                  style={[
                    pdfStyles.urgencyStep,
                    active
                      ? {
                          backgroundColor: activeStepColor,
                          borderColor: activeStepColor,
                        }
                      : {},
                  ]}
                >
                  <Text
                    style={
                      active
                        ? pdfStyles.urgencyStepTextActive
                        : pdfStyles.urgencyStepText
                    }
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>What&apos;s happening</Text>
        <Text style={pdfStyles.body}>{report.explanation}</Text>

        {report.urgency_rationale ? (
          <View style={pdfStyles.reasonBox}>
            <Text
              style={{
                fontSize: 9,
                fontFamily: "Helvetica-Bold",
                color: brand.gray900,
              }}
            >
              Why a vet — and why within this timeframe
            </Text>
            <Text style={[pdfStyles.body, { marginTop: 4 }]}>
              {report.urgency_rationale}
            </Text>
          </View>
        ) : null}

        {calibratedConfidence ? (
          <>
            <Text style={pdfStyles.sectionTitle}>Confidence calibration</Text>
            <View style={pdfStyles.handoffBox}>
              <Text style={pdfStyles.body}>
                {calibratedConfidence.recommendation}
              </Text>
              <Text style={[pdfStyles.bodySmall, { marginTop: 4 }]}>
                Base {(calibratedConfidence.base_confidence * 100).toFixed(0)}% ·
                Final {(calibratedConfidence.final_confidence * 100).toFixed(0)}% ·{" "}
                {formatConfidenceLevelLabel(
                  calibratedConfidence.confidence_level
                )}{" "}
                confidence
              </Text>
            </View>
          </>
        ) : null}

        {escalatedReport ? (
          <View
            style={[
              pdfStyles.alertBox,
              emergencyReport
                ? pdfStyles.alertBoxEmergency
                : pdfStyles.alertBoxUrgent,
            ]}
          >
            <Text style={pdfStyles.alertTitle}>
              {emergencyReport
                ? "Emergency clinic handoff"
                : "Same-day veterinary handoff"}
            </Text>
            <Text style={[pdfStyles.bodySmall, { marginTop: 4 }]}>
              {emergencyReport
                ? "Take this packet with you immediately and give the clinic handoff summary to intake staff on arrival."
                : "Bring this packet to the same-day appointment so the veterinary team can review the handoff summary, top differentials, and escalation signs quickly."}
            </Text>
          </View>
        ) : null}

        {report.vet_handoff_summary ? (
          <>
            <Text style={pdfStyles.sectionTitle}>For your vet</Text>
            <View style={pdfStyles.handoffBox}>
              <Text style={pdfStyles.body}>{report.vet_handoff_summary}</Text>
            </View>
          </>
        ) : null}

        {dxRows.length > 0 ? (
          <>
            <Text style={pdfStyles.sectionTitle}>What it could be</Text>
            <View style={pdfStyles.table}>
              {dxRows.map((row, i) => (
                <View
                  key={i}
                  style={[
                    pdfStyles.tableRow,
                    i === dxRows.length - 1 ? pdfStyles.tableRowLast : {},
                  ]}
                >
                  <View style={pdfStyles.colCondition}>
                    <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>
                      {row.condition}
                    </Text>
                    <Text style={pdfStyles.bodySmall}>{row.description}</Text>
                  </View>
                  <View style={pdfStyles.colLike}>
                    <Text style={pdfStyles.bodySmall}>{likelihoodLabel(row.likelihood)}</Text>
                  </View>
                  <View style={pdfStyles.colBar}>
                    <View style={pdfStyles.probBarTrack}>
                      <View
                        style={[
                          pdfStyles.probBarFill,
                          { width: `${Math.round(row.fraction * 100)}%` },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {report.clinical_notes ? (
          <>
            <Text style={pdfStyles.sectionTitle}>Clinical notes</Text>
            <Text style={pdfStyles.body}>{report.clinical_notes}</Text>
          </>
        ) : null}

        {report.home_care && report.home_care.length > 0 ? (
          <>
            <Text style={pdfStyles.sectionTitle}>Home care</Text>
            {report.home_care.map((c, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>
                  {c.instruction}{" "}
                  <Text style={pdfStyles.bodySmall}>({c.duration})</Text>
                </Text>
                <Text style={pdfStyles.bodySmall}>{c.details}</Text>
              </View>
            ))}
          </>
        ) : null}

        {report.warning_signs && report.warning_signs.length > 0 ? (
          <>
            <Text style={pdfStyles.sectionTitle}>Escalate immediately if</Text>
            {report.warning_signs.map((warning, index) => (
              <View key={index} style={pdfStyles.listItem}>
                <Text style={pdfStyles.bullet}>•</Text>
                <Text style={[pdfStyles.body, { flex: 1 }]}>{warning}</Text>
              </View>
            ))}
          </>
        ) : null}

        {report.vet_questions && report.vet_questions.length > 0 ? (
          <>
            <Text style={pdfStyles.sectionTitle}>Questions for your veterinarian</Text>
            {report.vet_questions.map((q, i) => (
              <View key={i} style={pdfStyles.listItem}>
                <Text style={pdfStyles.bullet}>•</Text>
                <Text style={[pdfStyles.body, { flex: 1 }]}>{q}</Text>
              </View>
            ))}
          </>
        ) : null}

        {report.evidenceChain && report.evidenceChain.length > 0 ? (
          <>
            <Text style={pdfStyles.sectionTitle}>Evidence chain</Text>
            {report.evidenceChain.map((item, index) => (
              <View key={index} style={pdfStyles.evidenceBox}>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#0369a1" }}>
                  {item.source} · {(item.confidence * 100).toFixed(0)}% confidence
                </Text>
                <Text style={[pdfStyles.body, { marginTop: 4 }]}>{item.finding}</Text>
                {item.supporting.length > 0 ? (
                  <Text style={pdfStyles.bodySmall}>
                    Supports: {item.supporting.join(" · ")}
                  </Text>
                ) : null}
                {item.contradicting.length > 0 ? (
                  <Text style={[pdfStyles.bodySmall, { color: brand.red }]}>
                    Contradictions: {item.contradicting.join(" · ")}
                  </Text>
                ) : null}
              </View>
            ))}
          </>
        ) : null}

        {shareUrl ? (
          <View style={pdfStyles.qrPlaceholder}>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: brand.gray600 }}>
              {escalatedReport
                ? "Clinic link (give to intake)"
                : "Share link (give to your vet)"}
            </Text>
            <Text style={[pdfStyles.bodySmall, { marginTop: 4 }]}>{shareUrl}</Text>
          </View>
        ) : null}

        <View style={pdfStyles.disclaimer}>
          <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: brand.gray700 }}>
            Medical disclaimer
          </Text>
          <Text style={[pdfStyles.bodySmall, { marginTop: 4 }]}>
            This AI analysis is for informational purposes only and is NOT a substitute for
            hands-on physical examination, diagnostic testing, or professional veterinary medical
            advice. Always consult a licensed veterinarian for diagnosis and treatment decisions.
            In emergencies, contact your nearest emergency veterinary hospital immediately.
          </Text>
        </View>

        <View style={pdfStyles.footer} fixed>
          <Text style={pdfStyles.footerText}>Generated by PawVital AI</Text>
          <Text style={pdfStyles.footerText}>{generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}
