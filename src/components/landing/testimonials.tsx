import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah M.",
    pet: "Cooper, Golden Retriever, 11",
    text: "PawVital told me exactly which supplements to give Cooper for his joints. Within 3 weeks, he was moving better than he had in years. My vet was genuinely surprised.",
    rating: 5,
  },
  {
    name: "Jessica R.",
    pet: "Luna, Labrador, 8",
    text: "I used to panic-Google every little thing at 2am. Now I just open PawVital and get a clear answer. The symptom checker alone has saved me hundreds in unnecessary vet visits.",
    rating: 5,
  },
  {
    name: "Michelle T.",
    pet: "Buddy, Beagle Mix, 13",
    text: "The health timeline is incredible. Buddy's entire wellness journey in one place. When I showed my vet, she said she wished all her clients used something like this.",
    rating: 5,
  },
];

export default function Testimonials() {
  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Pet Parents Love PawVital
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Join thousands of pet parents who finally have peace of mind.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex gap-1 mb-4">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-gray-700 leading-relaxed mb-6">&quot;{t.text}&quot;</p>
              <div>
                <p className="font-semibold text-gray-900">{t.name}</p>
                <p className="text-sm text-gray-500">{t.pet}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
