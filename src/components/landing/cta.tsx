"use client";

import { useState } from "react";
import { ArrowRight, Heart } from "lucide-react";
import Button from "@/components/ui/button";

export default function CTA() {
  const [email, setEmail] = useState("");

  return (
    <section className="py-24 bg-gradient-to-br from-blue-600 to-blue-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Heart className="w-12 h-12 text-red-300 mx-auto mb-6" />
        <h2 className="text-3xl sm:text-4xl font-bold text-white">
          Give Your Pet the Care They Deserve
        </h2>
        <p className="mt-4 text-xl text-blue-200 max-w-2xl mx-auto">
          $9.97/month or $847 for another panic vet visit. The choice is yours.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full sm:w-72 px-5 py-3.5 rounded-xl border-0 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/50"
          />
          <Button variant="secondary" size="lg">
            Start Free Trial <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>

        <p className="mt-4 text-sm text-blue-300">
          7-day free trial. No credit card required. Cancel anytime.
        </p>
      </div>
    </section>
  );
}
