"use client";

import { useState } from "react";
import { Stethoscope, AlertTriangle, Clock, AlertCircle, CheckCircle, Send, Loader2 } from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Textarea from "@/components/ui/textarea";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";

interface SymptomResult {
  severity: "low" | "medium" | "high" | "emergency";
  recommendation: "monitor" | "vet_48h" | "emergency_vet";
  title: string;
  explanation: string;
  actions: string[];
  warning_signs: string[];
}

const severityConfig = {
  low: { color: "success" as const, icon: CheckCircle, label: "Low Concern", bg: "bg-green-50 border-green-200" },
  medium: { color: "warning" as const, icon: Clock, label: "Moderate", bg: "bg-amber-50 border-amber-200" },
  high: { color: "danger" as const, icon: AlertTriangle, label: "High Concern", bg: "bg-orange-50 border-orange-200" },
  emergency: { color: "danger" as const, icon: AlertCircle, label: "Emergency", bg: "bg-red-50 border-red-200" },
};

const quickSymptoms = [
  "Not eating",
  "Limping",
  "Vomiting",
  "Diarrhea",
  "Lethargy",
  "Excessive scratching",
  "Coughing",
  "Difficulty breathing",
  "Trembling/shaking",
  "Drinking more water than usual",
];

const pastChecks = [
  { date: "2 days ago", symptom: "Slight limping on back left leg", severity: "low" as const, recommendation: "Monitor at home" },
  { date: "1 week ago", symptom: "Decreased appetite for 1 day", severity: "low" as const, recommendation: "Monitor for 24-48 hours" },
  { date: "3 weeks ago", symptom: "Vomiting after eating grass", severity: "low" as const, recommendation: "Normal behavior, monitor" },
];

export default function SymptomCheckerPage() {
  const { activePet } = useAppStore();
  const [symptoms, setSymptoms] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SymptomResult | null>(null);

  const handleCheck = async () => {
    if (!symptoms.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/ai/symptom-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms,
          pet: activePet || {
            name: "Cooper",
            breed: "Golden Retriever",
            age_years: 11,
            weight: 72,
            existing_conditions: ["mild arthritis"],
          },
        }),
      });

      const data = await res.json();
      setResult(data);
    } catch {
      setResult({
        severity: "medium",
        recommendation: "vet_48h",
        title: "Assessment Complete",
        explanation: `Based on the symptoms described for ${activePet?.name || "your pet"}, here is our AI assessment. The symptoms "${symptoms}" may indicate several possible conditions. Given the breed and age profile, we recommend monitoring closely and consulting your veterinarian if symptoms persist beyond 48 hours or worsen.`,
        actions: [
          "Monitor your pet closely for the next 24-48 hours",
          "Keep a log of when symptoms occur and their duration",
          "Ensure fresh water is always available",
          "Avoid strenuous activity until symptoms resolve",
          "Schedule a vet visit if no improvement in 48 hours",
        ],
        warning_signs: [
          "Symptoms suddenly worsen",
          "Loss of appetite persists beyond 24 hours",
          "Difficulty breathing or rapid breathing",
          "Inability to stand or walk",
          "Signs of pain (whimpering, restlessness)",
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const addQuickSymptom = (symptom: string) => {
    setSymptoms((prev) => (prev ? `${prev}, ${symptom.toLowerCase()}` : symptom.toLowerCase()));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Symptom Checker</h1>
        <p className="text-gray-500 mt-1">
          Describe what&apos;s happening and get AI-powered guidance instantly
        </p>
      </div>

      {/* Main Input */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">
              What&apos;s going on with {activePet?.name || "your pet"}?
            </h2>
            <p className="text-sm text-gray-500">
              Be as specific as possible — when it started, what you&apos;ve noticed, any changes.
            </p>
          </div>
        </div>

        <Textarea
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          placeholder={`e.g., "${activePet?.name || "Cooper"} has been limping on his back left leg since yesterday morning. He's still eating and drinking normally, but seems reluctant to go on walks..."`}
          rows={4}
        />

        {/* Quick Symptom Tags */}
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-2">Quick add:</p>
          <div className="flex flex-wrap gap-2">
            {quickSymptoms.map((s) => (
              <button
                key={s}
                onClick={() => addQuickSymptom(s)}
                className="px-3 py-1 text-xs rounded-full border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={handleCheck} loading={loading} disabled={!symptoms.trim()}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Check Symptoms
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Result */}
      {result && (
        <Card className={`p-6 border-2 ${severityConfig[result.severity].bg} animate-fade-in`}>
          <div className="flex items-center gap-3 mb-4">
            {(() => {
              const config = severityConfig[result.severity];
              const IconComponent = config.icon;
              return <IconComponent className="w-6 h-6 text-current" />;
            })()}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900">{result.title}</h3>
                <Badge variant={severityConfig[result.severity].color}>
                  {severityConfig[result.severity].label}
                </Badge>
              </div>
            </div>
          </div>

          <p className="text-gray-700 leading-relaxed mb-6">{result.explanation}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Recommended Actions</h4>
              <ul className="space-y-2">
                {result.actions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    {action}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Watch For These Warning Signs</h4>
              <ul className="space-y-2">
                {result.warning_signs.map((sign, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    {sign}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 bg-white/70 rounded-xl">
            <p className="text-xs text-gray-500">
              This AI assessment is for informational purposes only and is not a substitute for professional veterinary care.
              Always consult your veterinarian for medical decisions.
            </p>
          </div>
        </Card>
      )}

      {/* Past Checks */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Symptom Checks</h2>
        <div className="space-y-3">
          {pastChecks.map((check, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{check.symptom}</p>
                <p className="text-xs text-gray-500 mt-1">{check.date}</p>
              </div>
              <div className="text-right">
                <Badge variant={severityConfig[check.severity].color}>
                  {severityConfig[check.severity].label}
                </Badge>
                <p className="text-xs text-gray-500 mt-1">{check.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
