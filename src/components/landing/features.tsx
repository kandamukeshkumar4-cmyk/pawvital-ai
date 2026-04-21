"use client";

import { useState, useRef } from "react";
import { useInView, motion } from "framer-motion";
import {
  MessageSquare,
  BookOpen,
  Camera,
  PawPrint,
  Clock,
  ClipboardCopy,
} from "lucide-react";
import {
  SymptomChatIllustration,
  DiagnosisReportIllustration,
  VisionAnalysisIllustration,
  HealthTimelineIllustration,
} from "./illustrations";

const features = [
  {
    id: "chat",
    icon: MessageSquare,
    title: "Focused Symptom Intake",
    description:
      "Structured follow-up questions keep the dog symptom check focused and easier to explain to your veterinarian.",
    illustration: SymptomChatIllustration,
    color: "emerald",
  },
  {
    id: "evidence",
    icon: BookOpen,
    title: "Evidence-Supported Urgency Guidance",
    description:
      "PawVital combines deterministic canine triage rules, clinical references, and similar case patterns to explain why emergency, same-day, or routine care may be appropriate.",
    illustration: DiagnosisReportIllustration,
    color: "blue",
  },
  {
    id: "vision",
    icon: Camera,
    title: "Photo Context Support",
    description:
      "Upload a photo of a skin condition, eye issue, or wound when the concern is visible. PawVital uses guarded photo support to add context without guessing beyond the image.",
    illustration: VisionAnalysisIllustration,
    color: "indigo",
  },
  {
    id: "breed",
    icon: PawPrint,
    title: "Breed-Aware Canine Context",
    description:
      "Validated breed-aware context helps PawVital flag when a dog&apos;s breed may raise the urgency of certain symptoms.",
    illustration: null,
    color: "amber",
  },
  {
    id: "timeline",
    icon: Clock,
    title: "Health Timeline",
    description:
      "Track your dog's health over time. See trends, patterns, and improvement.",
    illustration: HealthTimelineIllustration,
    color: "teal",
  },
  {
    id: "handoff",
    icon: ClipboardCopy,
    title: "Vet Handoff Summary",
    description:
      "One-click sharing helps you hand the symptom timeline and urgency summary to your veterinarian.",
    illustration: null,
    color: "rose",
  },
] as const;

const colorMap: Record<
  string,
  { bg: string; iconBg: string; icon: string; tab: string; tabActive: string }
> = {
  emerald: {
    bg: "bg-emerald-50",
    iconBg: "bg-emerald-100",
    icon: "text-emerald-600",
    tab: "text-emerald-600",
    tabActive: "bg-emerald-50 border-emerald-500",
  },
  blue: {
    bg: "bg-blue-50",
    iconBg: "bg-blue-100",
    icon: "text-blue-600",
    tab: "text-blue-600",
    tabActive: "bg-blue-50 border-blue-500",
  },
  indigo: {
    bg: "bg-indigo-50",
    iconBg: "bg-indigo-100",
    icon: "text-indigo-600",
    tab: "text-indigo-600",
    tabActive: "bg-indigo-50 border-indigo-500",
  },
  amber: {
    bg: "bg-amber-50",
    iconBg: "bg-amber-100",
    icon: "text-amber-600",
    tab: "text-amber-600",
    tabActive: "bg-amber-50 border-amber-500",
  },
  teal: {
    bg: "bg-teal-50",
    iconBg: "bg-teal-100",
    icon: "text-teal-600",
    tab: "text-teal-600",
    tabActive: "bg-teal-50 border-teal-500",
  },
  rose: {
    bg: "bg-rose-50",
    iconBg: "bg-rose-100",
    icon: "text-rose-600",
    tab: "text-rose-600",
    tabActive: "bg-rose-50 border-rose-500",
  },
};

// Simple placeholder illustration for features that don't have a full SVG
function PlaceholderIllustration({
  icon: Icon,
  color,
  className = "",
}: {
  icon: typeof PawPrint;
  color: string;
  className?: string;
}) {
  const c = colorMap[color];
  return (
    <div
      className={`flex items-center justify-center rounded-2xl ${c.bg} ${className}`}
      style={{ minHeight: 200 }}
    >
      <div className={`${c.iconBg} rounded-3xl p-8`}>
        <Icon className={`w-16 h-16 ${c.icon}`} />
      </div>
    </div>
  );
}

export default function Features() {
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });
  const active = features[activeIdx];
  const colors = colorMap[active.color];

  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <motion.div
          className="text-center max-w-3xl mx-auto mb-14"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-block text-sm font-semibold text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full mb-4">
            Safety-First Features
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Everything That Makes PawVital Different
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Dog-only symptom-triage support with clear urgency guidance and a
            cleaner handoff to your veterinarian.
          </p>
        </motion.div>

        {/* Desktop: Tabbed interface */}
        <div className="hidden lg:block">
          {/* Tabs */}
          <motion.div
            className="flex gap-2 mb-10 justify-center flex-wrap"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {features.map((f, idx) => {
              const c = colorMap[f.color];
              const isActive = idx === activeIdx;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveIdx(idx)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-2 ${
                    isActive
                      ? `${c.tabActive} ${c.tab}`
                      : "border-transparent text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <f.icon className="w-4 h-4" />
                  {f.title}
                </button>
              );
            })}
          </motion.div>

          {/* Active feature display */}
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`grid grid-cols-2 gap-12 items-center ${colors.bg} rounded-3xl p-12`}
          >
            <div>
              <div
                className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl ${colors.iconBg} ${colors.icon} mb-6`}
              >
                <active.icon className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                {active.title}
              </h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                {active.description}
              </p>
            </div>
            <div>
              {active.illustration ? (
                <active.illustration className="w-full h-auto max-h-60 mx-auto" />
              ) : (
                <PlaceholderIllustration
                  icon={active.icon}
                  color={active.color}
                  className="w-full h-60"
                />
              )}
            </div>
          </motion.div>
        </div>

        {/* Mobile: Alternating cards */}
        <div className="lg:hidden space-y-8">
          {features.map((f, idx) => {
            const c = colorMap[f.color];
            return (
              <motion.div
                key={f.id}
                className={`${c.bg} rounded-2xl p-8`}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
              >
                <div
                  className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${c.iconBg} ${c.icon} mb-4`}
                >
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {f.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {f.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
