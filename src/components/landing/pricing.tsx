import { Check, Zap } from "lucide-react";
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

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Less Than a Bag of Treats
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Everything your pet needs for less than one-tenth of an unnecessary vet visit.
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-1">
          <div className="bg-white rounded-[calc(1.5rem-2px)] p-8 md:p-12">
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-6 h-6 text-amber-500" />
              <span className="text-sm font-semibold text-amber-600 uppercase tracking-wide">Most Popular</span>
            </div>

            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-5xl font-extrabold text-gray-900">$9.97</span>
              <span className="text-xl text-gray-500">/month</span>
            </div>

            <p className="text-gray-600 mb-8">
              Start with a 7-day free trial. Cancel anytime — no questions asked.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
              {features.map((feature) => (
                <div key={feature} className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                    <Check className="w-3 h-3 text-green-600" />
                  </div>
                  <span className="text-gray-700">{feature}</span>
                </div>
              ))}
            </div>

            <Button size="lg" className="w-full text-lg">
              Start Your 7-Day Free Trial
            </Button>

            <div className="mt-6 grid grid-cols-3 gap-4 text-center text-sm text-gray-500">
              <div>
                <div className="font-semibold text-gray-900">$847</div>
                <div>Avg emergency vet visit</div>
              </div>
              <div>
                <div className="font-semibold text-gray-900">$2,026</div>
                <div>Avg annual pet spending</div>
              </div>
              <div>
                <div className="font-semibold text-blue-600">$9.97</div>
                <div>PawVital per month</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
