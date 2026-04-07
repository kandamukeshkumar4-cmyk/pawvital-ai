"use client";

import { useRef } from "react";
import { MessageSquare, Activity, FileText, ArrowRight } from "lucide-react";
import { motion, useInView } from "framer-motion";

const steps = [
  {
    icon: MessageSquare,
    title: "Describe the Symptom",
    description:
      "Tell us what\u2019s wrong in plain language. Upload a photo if it helps.",
    color: "emerald",
  },
  {
    icon: Activity,
    title: "AI Analyzes Everything",
    description:
      "Our clinical matrix checks 200+ diseases, matches similar cases, and cross-references veterinary literature.",
    color: "blue",
  },
  {
    icon: FileText,
    title: "Get Your Report",
    description:
      "Receive a SOAP-format diagnosis with differential diagnoses, urgency rating, home care steps, and questions for your vet.",
    color: "indigo",
  },
];

const colorMap: Record<
  string,
  { bg: string; iconBg: string; icon: string; border: string; badge: string }
> = {
  emerald: {
    bg: "bg-emerald-50",
    iconBg: "bg-emerald-100",
    icon: "text-emerald-600",
    border: "border-emerald-200",
    badge: "bg-emerald-600",
  },
  blue: {
    bg: "bg-blue-50",
    iconBg: "bg-blue-100",
    icon: "text-blue-600",
    border: "border-blue-200",
    badge: "bg-blue-600",
  },
  indigo: {
    bg: "bg-indigo-50",
    iconBg: "bg-indigo-100",
    icon: "text-indigo-600",
    border: "border-indigo-200",
    badge: "bg-indigo-600",
  },
};

export default function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-block text-sm font-semibold text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full mb-4">
            Simple 3-Step Process
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            How PawVital Works
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            From symptom to report in minutes — not hours of anxious Googling.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-1/2 left-[16.5%] right-[16.5%] h-0.5 bg-gradient-to-r from-emerald-300 via-blue-300 to-indigo-300 -translate-y-1/2 z-0" />

          {steps.map((step, idx) => {
            const colors = colorMap[step.color];
            return (
              <motion.div
                key={step.title}
                className={`relative z-10 ${colors.bg} border ${colors.border} rounded-2xl p-8 text-center hover:shadow-lg transition-shadow duration-300`}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: idx * 0.15 }}
              >
                {/* Step number badge */}
                <div
                  className={`absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 ${colors.badge} rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md`}
                >
                  {idx + 1}
                </div>

                <div
                  className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${colors.iconBg} ${colors.icon} mb-5`}
                >
                  <step.icon className="w-8 h-8" />
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {step.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {step.description}
                </p>

                {/* Arrow between cards (desktop only) */}
                {idx < steps.length - 1 && (
                  <div className="hidden md:flex absolute -right-5 top-1/2 -translate-y-1/2 z-20">
                    <div className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center">
                      <ArrowRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
