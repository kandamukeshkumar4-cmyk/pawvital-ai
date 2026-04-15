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
  const emergencyReport = isEmergencyReport(report);
  const escalatedReport = isEscalatedReport(report);
  const band = severityBandStyle(report.severity);
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
          {report.confidence_calibration ? (
            <Text style={[pdfStyles.bodySmall, { marginTop: 2 }]}>
              Confidence level:{" "}
              {formatConfidenceLevelLabel(
                report.confidence_calibration.confidence_level
              )}
            </Text>
          ) : null}
          <Text style={[pdfStyles.body, { marginTop: 8 }]}>{report.explanation}</Text>
        </View>

        {report.confidence_calibration ? (
          <>
            <Text style={pdfStyles.sectionTitle}>Confidence calibration</Text>
            <View style={pdfStyles.handoffBox}>
              <Text style={pdfStyles.body}>
                {report.confidence_calibration.recommendation}
              </Text>
              <Text style={[pdfStyles.bodySmall, { marginTop: 4 }]}>
                Base {(report.confidence_calibration.base_confidence * 100).toFixed(0)}% ·
                Final {(report.confidence_calibration.final_confidence * 100).toFixed(0)}% ·{" "}
                {formatConfidenceLevelLabel(
                  report.confidence_calibration.confidence_level
                )}{" "}
                confidence
              </Text>
              {report.confidence_calibration.adjustments.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  {report.confidence_calibration.adjustments.map((adjustment, index) => (
                    <View key={`${adjustment.factor}-${index}`} style={pdfStyles.listItem}>
                      <Text style={pdfStyles.bullet}>•</Text>
                      <Text style={[pdfStyles.bodySmall, { flex: 1 }]}>
                        {adjustment.reason} ({adjustment.delta > 0 ? "+" : ""}
                        {(adjustment.delta * 100).toFixed(0)} pts)
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
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
            <Text style={pdfStyles.sectionTitle}>Vet handoff summary</Text>
            <View style={pdfStyles.handoffBox}>
              <Text style={pdfStyles.body}>{report.vet_handoff_summary}</Text>
            </View>
          </>
        ) : null}

        {dxRows.length > 0 ? (
          <>
            <Text style={pdfStyles.sectionTitle}>Differential diagnoses</Text>
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
                    <Text style={[pdfStyles.bodySmall, { marginTop: 2 }]}>
                      {(row.fraction * 100).toFixed(0)}% (illustrative)
                    </Text>
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
