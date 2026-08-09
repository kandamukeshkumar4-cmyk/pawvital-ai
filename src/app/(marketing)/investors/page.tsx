import type { Metadata } from "next";
import Link from "next/link";
import {
  Heart,
  Shield,
  Brain,
  Stethoscope,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  ArrowRight,
  Activity,
  Camera,
  FileText,
} from "lucide-react";
export const metadata: Metadata = {
  title: "Investor One-Pager | PawVital AI",
  description:
    "PawVital in one page: what it does, why the medical decisions are code instead of AI guesses, how it makes money, and what is actually built today.",
  robots: { index: false, follow: false },
};

const problemPoints = [
  "A dog throwing up can be nothing, or it can be a blockage that kills him by morning. At home, both look identical. So owners either spend $400 at the emergency clinic to be told he's fine, or they wait — and sometimes he isn't fine.",
  "There is nobody to ask at 11pm. The vet is closed. Search results give you \"totally normal\" and \"go now\" on the same page. General chatbots will invent an answer with total confidence and no accountability.",
  "Owners walk into the exam room and say \"he's been a bit off lately.\" That's not a history, and the vet spends the first ten minutes of a fifteen-minute appointment trying to reconstruct one.",
];

const productPillars = [
  {
    icon: Stethoscope,
    title: "The AI never makes the medical call",
    text: "The model runs the conversation. It does not decide anything. Routine, urgent, or emergency comes out of a hard-coded clinical matrix with breed-adjusted risk — same input, same answer, every single time. That is checked by tests, not promised in a prompt.",
  },
  {
    icon: Brain,
    title: "It remembers the dog",
    text: "Most symptom tools start from zero every visit. PawVital reads back 60 to 90 days of follow-ups, supplement trials, and vet notes, so the second session asks sharper questions than the first. Memory can raise concern. It is structurally incapable of talking an emergency down.",
  },
  {
    icon: Camera,
    title: "Show it instead of describing it",
    text: "Nobody can describe a rash accurately. Owners photograph the wound, the lump, the ear — vision classifiers score it and feed the same triage pipeline the conversation does.",
  },
  {
    icon: FileText,
    title: "It hands you off to a vet",
    text: "Every session ends in a report you can hand across the counter: what happened, when, how urgent, and the questions worth asking. We do not diagnose and we do not prescribe. We make the appointment you were already going to have a better one.",
  },
];

const moats = [
  {
    title: "Safety lives in the code, not the prompt",
    text: "Anyone can wrap a chat window around a model in a weekend. What takes months is making the medical logic deterministic and then proving it: hard-fail guardrails that block any dosage, brand name, or disease claim from ever reaching a user, and 2,300+ tests standing behind the rule that no amount of history can soften an urgency verdict.",
  },
  {
    title: "The record gets better the longer you stay",
    text: "Every session, follow-up, and outcome deepens that dog's file. A competitor can copy the interface tomorrow. They cannot copy eighteen months of your dog's history, and that history is exactly what makes the next answer good.",
  },
  {
    title: "No single model vendor can squeeze us",
    text: "Open-weight models on NVIDIA NIM carry the primary path, with a second model quietly running every session in parallel and logging where the two disagree. That gives us a live quality signal and the freedom to swap providers on price or performance.",
  },
];

const tractionPoints = [
  "The product is live and in production. Anyone can run a real triage right now, free, without making an account.",
  "2,300+ automated tests across 100+ suites, including scans that make it impossible to ship a dosage, a brand, or a disease claim.",
  "Analytics carry counts and categories only. Symptoms, free text, and photos cannot be logged, by construction rather than by policy.",
  "Every pull request goes through an automated clinical-safety review before it can merge, and deploys reach production in minutes.",
];

const businessModel = [
  {
    label: "Revenue",
    value: "$9.97 a month after a 7-day trial. One subscription covers every dog in the house, because people with two dogs are exactly the people who need this most.",
  },
  {
    label: "Funnel",
    value: "The first triage is free and needs no signup. People find us at the worst moment of their week, get a real answer, and subscribe for the history, the memory, and the vet reports.",
  },
  {
    label: "Next",
    value: "Clinics want the handoff report — that opens a B2B channel where the vet brings us the owner. Supplement and insurance partners come after that, and only through the same guardrails everything else passes.",
  },
];

const marketStats = [
  {
    stat: "~65M",
    label: "U.S. households own a dog. It is the biggest pet category and the one people spend the most feeling on.",
  },
  {
    stat: "$150B+",
    label: "goes into U.S. pets each year, and vet care is the part growing fastest.",
  },
  {
    stat: "168 hrs",
    label: "in a week that a dog can get sick. A clinic is open for maybe fifty of them.",
  },
];

export default function InvestorsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" target="_top" prefetch={false} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">PawVital AI</span>
          </Link>
          <a
            href="https://pawvital-ai.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
          >
            Live Product
          </a>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Hero */}
        <header className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-amber-600">
            PawVital AI · One-Pager
          </p>
          <h1 className="mt-3 text-4xl font-extrabold text-gray-900 sm:text-5xl">
            It is 11pm and your dog just threw up for the third time.
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-xl text-gray-600">
            Do you drive to the emergency clinic or go to bed? PawVital answers
            that in about a minute. An AI asks the questions a vet would ask.
            A deterministic clinical engine — not the AI — decides how urgent it
            is.
          </p>
        </header>

        {/* Problem */}
        <section className="mt-14">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Activity className="h-6 w-6 text-blue-600" />
            Why this exists
          </h2>
          <ul className="mt-4 space-y-3">
            {problemPoints.map((p) => (
              <li key={p} className="flex items-start gap-3 text-gray-700">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Product */}
        <section className="mt-14">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Stethoscope className="h-6 w-6 text-blue-600" />
            What we built
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {productPillars.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="rounded-2xl border border-gray-200 bg-gradient-to-br from-blue-50/50 to-white p-6"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-gray-900">{title}</h3>
                <p className="mt-2 text-gray-600">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Market */}
        <section className="mt-14">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <TrendingUp className="h-6 w-6 text-blue-600" />
            How big this gets
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {marketStats.map(({ stat, label }) => (
              <div
                key={stat}
                className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-center"
              >
                <p className="text-3xl font-extrabold text-white">{stat}</p>
                <p className="mt-2 text-sm text-blue-100">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-gray-600">
            We do dogs. Only dogs. Narrow scope is how the clinical logic stays
            defensible, and dog owners are the ones who panic hardest and pay
            fastest. Cats and the rest of the household run on the same engine
            when we are ready for them, which makes the second species a
            configuration problem instead of a rebuild.
          </p>
        </section>

        {/* Why we win */}
        <section className="mt-14">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Shield className="h-6 w-6 text-blue-600" />
            Why this is hard to copy
          </h2>
          <div className="mt-6 space-y-4">
            {moats.map(({ title, text }) => (
              <div key={title} className="rounded-2xl border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                <p className="mt-2 text-gray-600">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Business model */}
        <section className="mt-14">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <DollarSign className="h-6 w-6 text-blue-600" />
            How it makes money
          </h2>
          <div className="mt-6 space-y-4">
            {businessModel.map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-1 rounded-2xl bg-gray-50 p-5 sm:flex-row sm:gap-4">
                <span className="w-24 shrink-0 text-sm font-bold uppercase tracking-wide text-blue-600">
                  {label}
                </span>
                <span className="text-gray-700">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Traction & rigor */}
        <section className="mt-14">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <CheckCircle2 className="h-6 w-6 text-blue-600" />
            What is real today
          </h2>
          <ul className="mt-4 space-y-3">
            {tractionPoints.map((p) => (
              <li key={p} className="flex items-start gap-3 text-gray-700">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-gray-600">
            This is an engineering-complete product looking for its first real
            cohort of owners. The build risk is behind us. What is in front of
            us is distribution.
          </p>
        </section>

        {/* CTA */}
        <section className="mt-14 rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-8 text-center sm:p-10">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Don&apos;t take the page&apos;s word for it
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-blue-100">
            Open it, describe a symptom, and watch what it asks you. Two minutes
            tells you more than the rest of this page did.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://pawvital-ai.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-blue-700 transition-colors hover:bg-blue-50"
            >
              Try it right now
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/contact"
              target="_top"
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-6 py-3 font-semibold text-white transition-colors hover:bg-white/10"
            >
              Talk to us
            </Link>
          </div>
        </section>

        <p className="mt-10 text-center text-sm text-gray-500">
          PawVital helps owners judge urgency and prepare for a vet visit. It is
          not a diagnosis and it does not replace a veterinarian. Market figures
          are third-party industry estimates.
        </p>
      </main>
    </div>
  );
}
