"use client";

import { useRef } from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import { motion, useInView } from "framer-motion";

const rows = [
  {
    feature: "Urgency guidance",
    pawvital: "Dog-only triage support",
    generic: "Search engine results",
    pawvitalStatus: "check",
    genericStatus: "x",
  },
  {
    feature: "Breed-aware context",
    pawvital: "Validated canine context",
    generic: "One-size-fits-all",
    pawvitalStatus: "check",
    genericStatus: "x",
  },
  {
    feature: "Photo context support",
    pawvital: "Guarded image review",
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
    pawvital: "Shareable summary",
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
            PawVital vs Generic Symptom Apps
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Safety-first dog symptom triage with clearer next steps, not search
            engine shortcuts.
          </p>
        </motion.div>

        <motion.div
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="min-w-[720px]">
              {/* Table header */}
              <div className="grid grid-cols-3 gap-0 border-b border-gray-200 text-sm font-semibold">
                <div className="px-4 py-4 text-gray-500 sm:px-6">Feature</div>
                <div className="bg-emerald-50 px-4 py-4 text-center text-emerald-700 sm:px-6">
                  PawVital
                </div>
                <div className="px-4 py-4 text-center text-gray-500 sm:px-6">
                  Generic Apps
                </div>
              </div>

              {/* Table rows */}
              {rows.map((row, idx) => (
                <div
                  key={row.feature}
                  className={`grid grid-cols-3 gap-0 text-sm ${
                    idx < rows.length - 1 ? "border-b border-gray-100" : ""
                  } transition-colors hover:bg-gray-50/50`}
                >
                  <div className="px-4 py-4 font-medium text-gray-800 sm:px-6">
                    {row.feature}
                  </div>
                  <div className="flex items-center justify-center gap-2 bg-emerald-50/50 px-4 py-4 sm:px-6">
                    <StatusIcon status={row.pawvitalStatus} />
                    <span className="text-gray-700">{row.pawvital}</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 px-4 py-4 sm:px-6">
                    <StatusIcon status={row.genericStatus} />
                    <span className="text-gray-500">{row.generic}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
        <p className="mt-3 text-center text-xs text-gray-500 sm:hidden">
          Swipe sideways to compare every feature.
        </p>
      </div>
    </section>
  );
}
