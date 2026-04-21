"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Heart, Zap, Shield, ArrowRight } from "lucide-react";
import Button from "@/components/ui/button";

const features = [
  "Dog symptom triage support",
  "Vet handoff summaries",
  "Photo support for visible issues",
  "Care reminders and timeline",
  "Dog journal & health timeline",
  "Paw Circle community access",
  "Symptom history review",
  "Breed-aware canine context",
];

const faqs = [
  {
    q: "Is PawVital a replacement for my vet?",
    a: "No. PawVital helps dog owners understand urgency and prepare for a vet visit. It is not a diagnosis, it does not prescribe treatment, and it does not replace professional veterinary care.",
  },
  {
    q: "What happens after the free trial?",
    a: "After your 7-day free trial, you'll be charged $9.97/month. You can cancel anytime with one click — no questions asked, no hidden fees. Your dog's health data remains accessible even after cancellation.",
  },
  {
    q: "How should I use PawVital?",
    a: "Use PawVital for dog symptom triage support, urgency guidance, and vet handoff summaries. If you think your dog is having an emergency, contact a veterinarian immediately.",
  },
  {
    q: "Can I use PawVital for multiple dogs?",
    a: "Yes. Your subscription covers multiple dogs, so you can keep separate profiles and histories for each dog in your household.",
  },
  {
    q: "What breeds and species do you support?",
    a: "PawVital currently supports dogs only. Breed-aware guidance is limited to the validated canine scope documented in our current clinical audit.",
  },
];

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "", userId: "" }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // Redirect to signup if Stripe isn't configured
      window.location.href = "/signup";
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">PawVital AI</span>
          </Link>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-4">
            <Link href="/login" className="flex-1 sm:flex-none">
              <Button variant="ghost" size="sm" className="w-full sm:w-auto">
                Log In
              </Button>
            </Link>
            <Link href="/signup" className="flex-1 sm:flex-none">
              <Button size="sm" className="w-full sm:w-auto">
                Start Free Trial
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-50 via-white to-amber-50 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900">
            One Plan for Dog Symptom Triage Support
          </h1>
          <p className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto">
            Dog-only urgency guidance, symptom history, and vet handoff support
            in one place.
          </p>
        </div>
      </section>

      {/* Pricing Card */}
      <section className="py-16">
        <div className="max-w-lg mx-auto px-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-1">
            <div className="bg-white rounded-[calc(1.5rem-2px)] p-6 sm:p-8 md:p-10">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-6 h-6 text-amber-500" />
                <span className="text-sm font-bold text-amber-600 uppercase tracking-wide">
                  PawVital Pro
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-5xl font-extrabold text-gray-900">
                  $9.97
                </span>
                <span className="text-xl text-gray-500">/month</span>
              </div>
              <p className="text-gray-500 mb-8">
                7-day free trial included. Cancel anytime.
              </p>

              <div className="space-y-3 mb-8">
                {features.map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-green-600" />
                    </div>
                    <span className="text-gray-700">{f}</span>
                  </div>
                ))}
              </div>

              <Button
                size="lg"
                className="w-full text-lg"
                onClick={handleCheckout}
                loading={loading}
              >
                Start 7-Day Free Trial <ArrowRight className="w-5 h-5 ml-2" />
              </Button>

              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
                <Shield className="w-4 h-4" />
                <span>No credit card required for trial</span>
              </div>
            </div>
          </div>

          {/* Price Comparison */}
          <div className="mt-8 grid grid-cols-1 gap-3 text-center sm:grid-cols-3 sm:gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xl font-bold text-gray-900">$847</p>
              <p className="text-xs text-gray-500 mt-1">
                Avg emergency vet visit
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xl font-bold text-gray-900">$2,026</p>
              <p className="text-xs text-gray-500 mt-1">
                Avg annual dog care spending
              </p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-xl font-bold text-blue-600">$9.97</p>
              <p className="text-xs text-blue-600 mt-1">PawVital/month</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <button
                  className="flex w-full items-center justify-between px-4 py-4 text-left sm:px-6"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-semibold text-gray-900">{faq.q}</span>
                  <span className="text-gray-400 text-xl ml-4">
                    {openFaq === i ? "−" : "+"}
                  </span>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-gray-600 leading-relaxed animate-fade-in">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 bg-blue-600 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-white">
            Help Your Vet Start With a Clearer Picture
          </h2>
          <p className="mt-4 text-blue-200">
            Start your free trial today and use PawVital for dog symptom triage
            support, not diagnosis.
          </p>
          <div className="mt-8">
            <Button variant="secondary" size="lg" onClick={handleCheckout}>
              Start Free Trial <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
