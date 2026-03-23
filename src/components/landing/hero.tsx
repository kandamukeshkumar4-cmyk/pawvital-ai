"use client";

import { useState } from "react";
import { ArrowRight, Shield, Heart, Clock } from "lucide-react";
import Button from "@/components/ui/button";

export default function Hero() {
  const [email, setEmail] = useState("");

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-amber-50">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-5" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 lg:pt-32 lg:pb-36">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Shield className="w-4 h-4" />
            AI-Powered Pet Wellness
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight">
            Stop Googling Your Dog&apos;s Symptoms at{" "}
            <span className="text-blue-600">2am</span>
          </h1>

          <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            PawVital AI gives you a 24/7 pet health companion that tracks wellness,
            checks symptoms, and tells you exactly what to do — so you never have to
            panic-search &quot;is my dog dying&quot; again.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="flex w-full sm:w-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full sm:w-72 px-5 py-3.5 rounded-l-xl border border-r-0 border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <Button size="lg" className="rounded-l-none whitespace-nowrap">
                Start Free Trial <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>

          <p className="mt-4 text-sm text-gray-500">
            7-day free trial. Then just $9.97/month. Cancel anytime.
          </p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" />
              <span>Trusted by 2,000+ pet parents</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              <span>Vet-informed AI guidance</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <span>24/7 instant answers</span>
            </div>
          </div>
        </div>

        {/* Dashboard Preview */}
        <div className="mt-16 max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="ml-3 text-sm text-gray-500">PawVital AI Dashboard</span>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 text-center">
                <div className="text-5xl font-bold text-green-600">87</div>
                <div className="mt-2 text-sm text-green-700 font-medium">Health Score</div>
                <div className="mt-1 text-xs text-green-600">Excellent</div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6">
                <div className="text-sm font-medium text-blue-700 mb-2">Quick Check</div>
                <div className="bg-white rounded-lg p-3 text-sm text-gray-600">
                  &quot;Cooper is limping slightly on his back left leg...&quot;
                </div>
                <div className="mt-2 text-xs text-blue-600 font-medium">AI analyzing symptoms...</div>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-6">
                <div className="text-sm font-medium text-amber-700 mb-2">Today&apos;s Reminders</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    Joint supplement - 8:00 AM
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Evening walk logged
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
