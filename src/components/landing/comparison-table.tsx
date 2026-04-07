"use client";

import { useRef } from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import { motion, useInView } from "framer-motion";

const rows = [
  {
    feature: "Evidence-based diagnosis",
    pawvital: "Merck + WAVD + 10K cases",
    generic: "Search engine results",
    pawvitalStatus: "check",
    genericStatus: "x",
  },
  {
    feature: "Breed-specific analysis",
    pawvital: "200+ breed multipliers",
    generic: "One-size-fits-all",
    pawvitalStatus: "check",
    genericStatus: "x",
  },
  {
    feature: "Vision analysis",
    pawvital: "3-tier AI pipeline",
    generic: "No image support",
    pawvitalStatus: "check",
    genericStatus: "x",
  },
  {
    feature: "Follow-up questions",
    pawvital: "Clinically structured",
    generic: "Generic checklist",
    pawvitalStatus: "check",
    genericStatus: "x",
  },
  {
    feature: "Vet handoff report",
    pawvital: "SOAP format",
    generic: "None",
    pawvitalStatus: "check",
    genericStatus: "x",
  },
  {
    feature: "Privacy",
    pawvital: "No data selling",
    generic: "Varies",
    pawvitalStatus: "check",
    genericStatus: "warn",
  },
] as const;

function StatusIcon({ status }: { status: "check" | "x" | "warn" }) {
  if (status === "check")
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100">
        <Check className="w-4 h-4 text-emerald-600" />
      </span>
    );
  if (status === "warn")
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100">
      <X className="w-4 h-4 text-red-500" />
    </span>
  );
}

export default function ComparisonTable() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <motion.div
          className="text-center max-w-3xl mx-auto mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            PawVital vs Generic Pet Health Apps
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Clinical-grade triage built on real veterinary data — not search
            engine shortcuts.
          </p>
        </motion.div>

        <motion.div
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {/* Table header */}
          <div className="grid grid-cols-3 gap-0 text-sm font-semibold border-b border-gray-200">
            <div className="px-6 py-4 text-gray-500">Feature</div>
            <div className="px-6 py-4 text-emerald-700 bg-emerald-50 text-center">
              PawVital AI
            </div>
            <div className="px-6 py-4 text-gray-500 text-center">
              Generic Apps
            </div>
          </div>

          {/* Table rows */}
          {rows.map((row, idx) => (
            <div
              key={row.feature}
              className={`grid grid-cols-3 gap-0 text-sm ${
                idx < rows.length - 1 ? "border-b border-gray-100" : ""
              } hover:bg-gray-50/50 transition-colors`}
            >
              <div className="px-6 py-4 font-medium text-gray-800">
                {row.feature}
              </div>
              <div className="px-6 py-4 bg-emerald-50/50 flex items-center gap-2 justify-center">
                <StatusIcon status={row.pawvitalStatus} />
                <span className="text-gray-700">{row.pawvital}</span>
              </div>
              <div className="px-6 py-4 flex items-center gap-2 justify-center">
                <StatusIcon status={row.genericStatus} />
                <span className="text-gray-500">{row.generic}</span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
