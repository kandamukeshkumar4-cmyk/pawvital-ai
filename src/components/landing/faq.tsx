"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { motion, useInView, AnimatePresence } from "framer-motion";

interface FaqItem {
  question: string;
  answer: string;
}

function FaqAccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 px-6 text-left hover:bg-gray-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
        aria-expanded={isOpen}
      >
        <span className="text-base font-medium text-gray-900 pr-4">
          {item.question}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-5 text-gray-600 leading-relaxed">
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  useEffect(() => {
    fetch("/content/faq.json")
      .then((res) => res.json())
      .then((data: FaqItem[]) => setFaqItems(data))
      .catch(() => {
        // Fallback FAQ data if JSON fails to load
        setFaqItems([
          {
            question: "Is this a replacement for a vet?",
            answer:
              "No. PawVital AI is a triage tool that helps you understand symptoms and decide whether a vet visit is needed. Always consult your veterinarian for medical decisions.",
          },
          {
            question: "What breeds do you support?",
            answer:
              "PawVital currently supports dogs only. Breed-aware guidance is limited to the validated canine scope documented in the current clinical audit.",
          },
          {
            question: "How does the AI work?",
            answer:
              "PawVital uses a deterministic canine clinical matrix combined with AI-supported retrieval from veterinary manuals, curated clinical cases, and reference imagery.",
          },
        ]);
      });
  }, []);

  return (
    <section id="faq" className="py-24 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Frequently Asked Questions
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Everything you need to know about PawVital AI.
          </p>
        </motion.div>

        <motion.div
          className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y-0 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {faqItems.map((item, idx) => (
            <FaqAccordionItem
              key={idx}
              item={item}
              isOpen={openIndex === idx}
              onToggle={() =>
                setOpenIndex(openIndex === idx ? null : idx)
              }
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
