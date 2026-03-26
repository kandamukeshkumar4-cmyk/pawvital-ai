"use client";

import { useState } from "react";
import { Pill, ExternalLink, Sparkles } from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";

interface SupplementItem {
  id: string;
  name: string;
  purpose: string;
  dosage: string;
  frequency: string;
  brand: string;
  price: string;
  isActive: boolean;
  priority: "essential" | "recommended" | "optional";
}

const aiRecommendations: SupplementItem[] = [
  {
    id: "1",
    name: "Glucosamine & Chondroitin",
    purpose: "Joint health & mobility support",
    dosage: "1,500mg daily",
    frequency: "Once daily with food",
    brand: "Nutramax Dasuquin",
    price: "$35/month",
    isActive: true,
    priority: "essential",
  },
  {
    id: "2",
    name: "Omega-3 Fish Oil",
    purpose: "Anti-inflammatory, skin & coat health",
    dosage: "1,000mg EPA+DHA daily",
    frequency: "Once daily with food",
    brand: "Nordic Naturals Omega-3 Pet",
    price: "$25/month",
    isActive: true,
    priority: "essential",
  },
  {
    id: "3",
    name: "Probiotic",
    purpose: "Digestive health & immune support",
    dosage: "1 scoop daily",
    frequency: "Once daily with morning meal",
    brand: "Purina Pro Plan FortiFlora",
    price: "$30/month",
    isActive: true,
    priority: "recommended",
  },
  {
    id: "4",
    name: "CoQ10",
    purpose: "Heart health & cellular energy",
    dosage: "100mg daily",
    frequency: "Once daily",
    brand: "Zesty Paws CoQ10",
    price: "$22/month",
    isActive: false,
    priority: "optional",
  },
  {
    id: "5",
    name: "Calming Support",
    purpose: "Anxiety & stress reduction",
    dosage: "As needed",
    frequency: "During storms, travel, or stressful events",
    brand: "VetriScience Composure",
    price: "$18/month",
    isActive: false,
    priority: "optional",
  },
];

const priorityConfig = {
  essential: { label: "Essential", variant: "danger" as const },
  recommended: { label: "Recommended", variant: "warning" as const },
  optional: { label: "Optional", variant: "info" as const },
};

export default function SupplementsPage() {
  const { activePet } = useAppStore();
  const [supplements, setSupplements] = useState(aiRecommendations);
  const [generating, setGenerating] = useState(false);

  const toggleSupplement = (id: string) => {
    setSupplements((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s))
    );
  };

  const generatePlan = async () => {
    setGenerating(true);
    // Simulate AI generation
    await new Promise((r) => setTimeout(r, 2000));
    setGenerating(false);
  };

  const activeCount = supplements.filter((s) => s.isActive).length;
  const monthlyCost = supplements
    .filter((s) => s.isActive)
    .reduce((sum, s) => sum + parseInt(s.price.replace(/[^0-9]/g, "")), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Supplement Plan</h1>
          <p className="text-gray-500 mt-1">
            AI-personalized nutrition recommendations for {activePet?.name || "your pet"}
          </p>
        </div>
        <Button onClick={generatePlan} loading={generating}>
          <Sparkles className="w-4 h-4 mr-2" />
          Regenerate Plan
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{activeCount}</p>
          <p className="text-sm text-gray-500">Active Supplements</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-bold text-green-600">${monthlyCost}</p>
          <p className="text-sm text-gray-500">Monthly Cost</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-bold text-amber-600">A+</p>
          <p className="text-sm text-gray-500">Nutrition Grade</p>
        </Card>
      </div>

      {/* AI Insight */}
      <Card className="p-5 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">
              AI Recommendation for {activePet?.name || "Cooper"}
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Based on {activePet?.name || "Cooper"}&apos;s age ({activePet?.age_years || 11} years),
              breed ({activePet?.breed || "Golden Retriever"}), and existing conditions
              (mild arthritis), we prioritize joint support and anti-inflammatory supplements.
              The Glucosamine + Omega-3 combination has shown 73% improvement in mobility
              for similar profiles.
            </p>
          </div>
        </div>
      </Card>

      {/* Supplement List */}
      <div className="space-y-4">
        {supplements.map((supp) => (
          <Card
            key={supp.id}
            className={`p-6 transition-all ${
              supp.isActive ? "border-blue-200 bg-white" : "bg-gray-50 opacity-75"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    supp.isActive ? "bg-blue-100" : "bg-gray-200"
                  }`}
                >
                  <Pill className={`w-6 h-6 ${supp.isActive ? "text-blue-600" : "text-gray-400"}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{supp.name}</h3>
                    <Badge variant={priorityConfig[supp.priority].variant}>
                      {priorityConfig[supp.priority].label}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{supp.purpose}</p>
                  <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
                    <span>Dose: {supp.dosage}</span>
                    <span>Frequency: {supp.frequency}</span>
                    <span>Brand: {supp.brand}</span>
                    <span className="font-medium text-gray-700">{supp.price}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="#"
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Buy this supplement"
                >
                  <ExternalLink className="w-4 h-4 text-gray-400" />
                </a>
                <button
                  onClick={() => toggleSupplement(supp.id)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    supp.isActive ? "bg-blue-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      supp.isActive ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Disclaimer */}
      <Card className="p-4 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          Supplement recommendations are generated by AI based on your pet&apos;s profile.
          Always consult your veterinarian before starting any new supplement regimen.
          Affiliate links may be used.
        </p>
      </Card>
    </div>
  );
}
