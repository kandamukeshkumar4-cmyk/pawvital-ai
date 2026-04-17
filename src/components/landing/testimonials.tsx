"use client";

import { useRef } from "react";
import { Star } from "lucide-react";
import { motion, useInView } from "framer-motion";

const testimonials = [
  {
    name: "Sarah M.",
    pet: "Cooper, Golden Retriever, 11 yrs",
    text: "The AI asked me questions my regular vet would ask — onset, duration, severity. Within minutes I had a SOAP report showing likely osteoarthritis with 72% confidence. My vet confirmed it the next day.",
    rating: 5,
  },
  {
    name: "David K.",
    pet: "Luna, Boxer Mix, 6 yrs",
    text: "I uploaded a photo of a skin patch on Luna's ear and PawVital matched it to similar canine cases in seconds. It flagged a same-day skin check and gave my vet a much clearer starting point.",
    rating: 5,
  },
  {
    name: "Michelle T.",
    pet: "Buddy, Beagle Mix, 13 yrs",
    text: "The health timeline let me track Buddy's joint mobility over three months. When I showed my vet the trend data, she said it was more detailed than most owners ever provide. The vet handoff summary is perfect.",
    rating: 5,
  },
  {
    name: "James R.",
    pet: "Max, Dachshund, 8 yrs",
    text: "PawVital flagged Max's back pain as high-risk because of his breed — Dachshunds are 10x more likely to get IVDD. That breed-specific warning got us to the vet faster. Turned out to be early-stage IVDD.",
    rating: 5,
  },
];

export default function Testimonials() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="py-24 bg-gradient-to-br from-gray-50 to-emerald-50/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Trusted by Dog Parents Who Want Real Answers
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            See how PawVital is helping dog owners make better decisions.
          </p>
        </motion.div>

        {/* Desktop grid / Mobile horizontal scroll */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {testimonials.map((t, idx) => (
            <motion.div
              key={t.name}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 hover:shadow-lg transition-shadow duration-300 flex flex-col"
              initial={{ opacity: 0, y: 25 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 fill-amber-400 text-amber-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="text-gray-700 text-sm leading-relaxed flex-1 mb-5">
                &ldquo;{t.text}&rdquo;
              </p>

              {/* Author */}
              <div className="border-t border-gray-100 pt-4">
                <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t.pet}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
