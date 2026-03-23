"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Heart, Zap, Shield, ArrowRight } from "lucide-react";
import Button from "@/components/ui/button";

const features = [
  "AI Health Dashboard with daily score",
  "24/7 Symptom Checker & Vet Decision Engine",
  "Personalized supplement & nutrition plans",
  "Medication & wellness reminders",
  "Pet journal & health timeline",
  "Paw Circle community access",
  "Monthly wellness reports",
  "Unlimited AI health consultations",
];

const faqs = [
  {
    q: "Is PawVital a replacement for my vet?",
    a: "No. PawVital AI is a wellness companion that helps you make informed decisions between vet visits. It helps you know when to monitor at home vs. when to seek professional care, potentially saving you unnecessary emergency visits while ensuring you don't miss anything serious.",
  },
  {
    q: "What happens after the free trial?",
    a: "After your 7-day free trial, you'll be charged $9.97/month. You can cancel anytime with one click — no questions asked, no hidden fees. Your pet's health data remains accessible even after cancellation.",
  },
  {
    q: "How accurate is the AI?",
    a: "PawVital AI is trained on extensive veterinary data and provides breed-specific, age-appropriate guidance. It's designed to err on the side of caution — if there's any doubt, it will recommend professional veterinary care.",
  },
  {
    q: "Can I use PawVital for multiple pets?",
    a: "Yes! Your subscription covers unlimited pets. You can add as many pet profiles as you need and switch between them easily.",
  },
  {
    q: "What breeds and species do you support?",
    a: "PawVital currently supports dogs and cats of all breeds. Our AI has breed-specific data for over 200 dog breeds and 50 cat breeds.",
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">PawVital AI</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" size="sm">Log In</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Start Free Trial</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 bg-gradient-to-br from-blue-50 via-white to-amber-50">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900">
            One Plan. Everything Your Pet Needs.
          </h1>
          <p className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto">
            Less than a bag of premium dog treats. Less than one-tenth of an
            unnecessary emergency vet visit.
          </p>
        </div>
      </section>

      {/* Pricing Card */}
      <section className="py-16">
        <div className="max-w-lg mx-auto px-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-1">
            <div className="bg-white rounded-[calc(1.5rem-2px)] p-8 md:p-10">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-6 h-6 text-amber-500" />
                <span className="text-sm font-bold text-amber-600 uppercase tracking-wide">
                  PawVital Pro
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-5xl font-extrabold text-gray-900">$9.97</span>
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

              <Button size="lg" className="w-full text-lg" onClick={handleCheckout} loading={loading}>
                Start 7-Day Free Trial <ArrowRight className="w-5 h-5 ml-2" />
              </Button>

              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
                <Shield className="w-4 h-4" />
                <span>No credit card required for trial</span>
              </div>
            </div>
          </div>

          {/* Price Comparison */}
          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xl font-bold text-gray-900">$847</p>
              <p className="text-xs text-gray-500 mt-1">Avg emergency vet visit</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xl font-bold text-gray-900">$2,026</p>
              <p className="text-xs text-gray-500 mt-1">Avg annual pet spending</p>
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
                  className="w-full px-6 py-4 text-left flex items-center justify-between"
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
            Your Pet Deserves the Best
          </h2>
          <p className="mt-4 text-blue-200">
            Start your free trial today and see the difference AI-powered wellness makes.
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
