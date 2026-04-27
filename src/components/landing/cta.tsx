"use client";

import { useRef } from "react";
import { ArrowRight, PawPrint } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { buttonClassName } from "@/components/ui/button";

export default function CTA() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <section className="py-24 bg-gradient-to-br from-emerald-600 to-emerald-800 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl" />
      </div>

      <div
        className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        ref={ref}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <PawPrint className="w-12 h-12 text-emerald-300 mx-auto mb-6" />

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            Don&apos;t wait to wonder.
            <br />
            Check your dog&apos;s symptoms now.
          </h2>

          <p className="mt-6 text-xl text-emerald-200 max-w-2xl mx-auto">
            Clear dog-symptom next steps in minutes, plus a summary to share
            with your veterinarian.
          </p>

          <div className="mt-10">
            <a
              href="/symptom-checker"
              target="_top"
              className={buttonClassName({
                size: "lg",
                className:
                  "bg-white text-emerald-700 hover:bg-emerald-50 shadow-lg shadow-emerald-900/20 text-lg px-10",
              })}
            >
              Start Free Symptom Check{" "}
              <ArrowRight className="w-5 h-5 ml-2" />
            </a>
          </div>

          <p className="mt-4 text-sm text-emerald-300">
            Free to start. No credit card required.
          </p>
          <p className="mt-2 text-sm text-emerald-200/90">
            If you think your dog is having an emergency, contact a
            veterinarian immediately.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
