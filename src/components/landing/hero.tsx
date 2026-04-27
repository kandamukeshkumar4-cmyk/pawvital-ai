"use client";

import { useRef } from "react";
import {
  ArrowRight,
  Shield,
  BookOpen,
  Image as ImageIcon,
  FlaskConical,
} from "lucide-react";
import { motion, useInView } from "framer-motion";
import { buttonClassName } from "@/components/ui/button";

export default function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-blue-50">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-100/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-100/30 rounded-full blur-3xl" />
      </div>

      <div
        className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 lg:pt-36 lg:pb-32"
        ref={ref}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left side: Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
              <Shield className="w-4 h-4" />
              Dog-Only Symptom Triage Support
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight">
              Your Dog&apos;s Symptoms,{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-blue-600">
                turned into clearer next steps
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-xl leading-relaxed">
              PawVital combines deterministic canine triage logic with vetted
              clinical references to help you understand urgency, prepare for a
              vet visit, and avoid generic search-result guesswork. It does not
              diagnose your dog or replace a veterinarian.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-start gap-4">
              <a
                href="/symptom-checker"
                target="_top"
                className={buttonClassName({
                  size: "lg",
                  className:
                    "bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/25 focus:ring-emerald-500",
                })}
              >
                Start Free Symptom Check{" "}
                <ArrowRight className="w-5 h-5 ml-2" />
              </a>
              <a
                href="#how-it-works"
                className={buttonClassName({
                  variant: "outline",
                  size: "lg",
                  className: "border-gray-300 text-gray-700 hover:bg-gray-50",
                })}
              >
                See How It Works
              </a>
            </div>

            {/* Trust badges */}
            <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-emerald-500" />
                <span>Curated clinical cases</span>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-500" />
                <span>Deterministic canine triage logic</span>
              </div>
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-500" />
                <span>Reference image support</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-500" />
                <span>Evidence-Based</span>
              </div>
            </div>
          </motion.div>

          {/* Right side: Floating chat mockup */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="hidden lg:block"
          >
            <div className="relative">
              {/* Main chat card */}
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transform rotate-1 hover:rotate-0 transition-transform duration-500">
                {/* Chat header */}
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-300" />
                  <span className="text-white text-sm font-medium">
                    PawVital — Dog Symptom Check
                  </span>
                </div>

                {/* Chat messages */}
                <div className="p-6 space-y-4">
                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="bg-blue-50 rounded-2xl rounded-br-md px-4 py-3 max-w-[240px]">
                      <p className="text-sm text-gray-800">
                        My golden retriever Cooper has been limping on his back
                        left leg for 2 days
                      </p>
                    </div>
                  </div>

                  {/* AI response */}
                  <div className="flex justify-start">
                    <div className="bg-emerald-50 rounded-2xl rounded-bl-md px-4 py-3 max-w-[280px]">
                      <p className="text-sm text-gray-800">
                        I&apos;ll help you think through urgency and next steps for
                        that limp.
                      </p>
                      <p className="text-sm text-gray-800 mt-2">
                        A few follow-up questions:
                      </p>
                      <ul className="text-sm text-gray-700 mt-1 space-y-1">
                        <li className="flex items-start gap-1.5">
                          <span className="text-emerald-500 mt-0.5">•</span>
                          How old is Cooper?
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-emerald-500 mt-0.5">•</span>
                          Any swelling visible?
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-emerald-500 mt-0.5">•</span>
                          Did it start suddenly?
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Typing indicator */}
                  <div className="flex items-center gap-1 pl-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>

              {/* Floating evidence badge */}
              <div className="absolute -bottom-4 -left-4 bg-white rounded-xl shadow-lg border border-gray-200 px-4 py-3 transform -rotate-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">
                      Clinical references
                    </p>
                    <p className="text-xs text-gray-500">Evidence-based</p>
                  </div>
                </div>
              </div>

              {/* Floating urgency badge */}
              <div className="absolute -top-3 -right-3 bg-white rounded-xl shadow-lg border border-gray-200 px-4 py-3 transform rotate-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                    <span className="text-amber-600 text-sm font-bold">⚡</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">
                      Moderate Urgency
                    </p>
                    <p className="text-xs text-gray-500">Schedule vet visit</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
