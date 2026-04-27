"use client";

import { useRef } from "react";
import { Check, Zap, ArrowRight } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { buttonClassName } from "@/components/ui/button";

const freeFeatures = [
  "Basic dog symptom checks (3/month)",
  "Urgency guidance",
  "Single dog profile",
];

const premiumFeatures = [
  "More dog symptom checks",
  "Vet handoff summaries",
  "Photo support for visible issues",
  "Breed-aware canine context",
  "Health timeline & trends",
  "Multi-dog profiles",
  "Priority support",
];

export default function Pricing() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Start free. Upgrade when you need more dog symptom-triage support.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {/* Free tier */}
          <motion.div
            className="flex flex-col rounded-2xl border-2 border-gray-200 bg-white p-6 sm:p-8"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Free</h3>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-4xl font-extrabold text-gray-900">
                  $0
                </span>
                <span className="text-gray-500">/month</span>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Basic dog symptom checks to get started.
              </p>
            </div>

            <div className="space-y-3 flex-1 mb-8">
              {freeFeatures.map((f) => (
                <div key={f} className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                    <Check className="w-3 h-3 text-gray-500" />
                  </div>
                  <span className="text-gray-600 text-sm">{f}</span>
                </div>
              ))}
            </div>

            <a
              href="/signup"
              target="_top"
              className={buttonClassName({
                variant: "outline",
                className: "w-full",
              })}
            >
              Sign Up Free
            </a>
          </motion.div>

          {/* Premium tier */}
          <motion.div
            className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-1 relative"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {/* Popular badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <div className="inline-flex items-center gap-1.5 bg-amber-500 text-white rounded-full px-4 py-1 text-xs font-semibold shadow-lg">
                <Zap className="w-3 h-3" />
                Most Popular
              </div>
            </div>

            <div className="flex flex-col rounded-[calc(1rem-2px)] bg-white p-6 sm:p-8">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Premium</h3>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-extrabold text-gray-900">
                    $9.97
                  </span>
                  <span className="text-gray-500">/month</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  7-day free trial. Cancel anytime.
                </p>
              </div>

              <div className="space-y-3 flex-1 mb-8">
                {premiumFeatures.map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Check className="w-3 h-3 text-emerald-600" />
                    </div>
                    <span className="text-gray-700 text-sm">{f}</span>
                  </div>
                ))}
              </div>

              <a
                href="/signup"
                target="_top"
                className={buttonClassName({
                  size: "lg",
                  className:
                    "w-full bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/25 focus:ring-emerald-500",
                })}
              >
                Start 7-Day Free Trial <ArrowRight className="w-5 h-5 ml-2" />
              </a>
            </div>
          </motion.div>
        </div>

        {/* Cost comparison */}
        <motion.div
          className="mx-auto mt-12 grid max-w-2xl grid-cols-1 gap-3 text-center text-sm text-gray-500 sm:grid-cols-3 sm:gap-4"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div>
            <div className="font-semibold text-gray-900 text-lg">$847</div>
            <div>Avg emergency vet visit</div>
          </div>
          <div>
            <div className="font-semibold text-gray-900 text-lg">$2,026</div>
            <div>Avg annual dog care spending</div>
          </div>
          <div>
            <div className="font-semibold text-emerald-600 text-lg">$9.97</div>
            <div>PawVital per month</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
