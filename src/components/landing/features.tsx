import { Activity, Stethoscope, Pill, Bell, BookOpen, Users } from "lucide-react";

const features = [
  {
    icon: Activity,
    title: "AI Health Dashboard",
    description: "Daily health score (1-100) based on your pet's breed, age, weight, activity, and logged symptoms. Know exactly how your pet is doing at a glance.",
    color: "blue",
  },
  {
    icon: Stethoscope,
    title: "Symptom Checker",
    description: "Describe what's happening and get instant, breed-specific guidance: monitor at home, schedule a vet visit, or go to emergency. No more panic Googling.",
    color: "green",
  },
  {
    icon: Pill,
    title: "Supplement Plans",
    description: "Personalized supplement and nutrition recommendations based on your pet's unique profile. Updated monthly as they age.",
    color: "purple",
  },
  {
    icon: Bell,
    title: "Smart Reminders",
    description: "Never miss a medication, flea treatment, or vet appointment again. Automated reminders for everything your pet needs.",
    color: "amber",
  },
  {
    icon: BookOpen,
    title: "Pet Journal",
    description: "A beautiful timeline of your pet's life — health events, milestones, weight changes, and photos. Their complete story in one place.",
    color: "pink",
  },
  {
    icon: Users,
    title: "Paw Circle Community",
    description: "Connect with other pet parents dealing with similar issues. Senior dog care, breed-specific health, anxiety support, and more.",
    color: "teal",
  },
];

const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
  blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-blue-200" },
  green: { bg: "bg-green-50", icon: "text-green-600", border: "border-green-200" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600", border: "border-purple-200" },
  amber: { bg: "bg-amber-50", icon: "text-amber-600", border: "border-amber-200" },
  pink: { bg: "bg-pink-50", icon: "text-pink-600", border: "border-pink-200" },
  teal: { bg: "bg-teal-50", icon: "text-teal-600", border: "border-teal-200" },
};

export default function Features() {
  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Everything Your Pet Needs. One App.
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Like having a vet, nutritionist, and pet health expert in your pocket —
            available 24/7 for less than a bag of treats.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature) => {
            const colors = colorMap[feature.color];
            return (
              <div
                key={feature.title}
                className={`${colors.bg} border ${colors.border} rounded-2xl p-8 hover:shadow-lg transition-all duration-300`}
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${colors.bg} ${colors.icon}`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-gray-900">{feature.title}</h3>
                <p className="mt-2 text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
