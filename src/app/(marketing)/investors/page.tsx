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
    "PawVital AI in one page: AI-guided dog symptom triage with a deterministic clinical safety core, a live product, and a subscription business model.",
  robots: { index: false, follow: false },
};

const problemPoints = [
  "Dog owners can't tell a wait-and-see symptom from an emergency, so they either over-pay for panic visits or dangerously delay care.",
  "After-hours vet advice is scarce and expensive; general-purpose chatbots guess, hallucinate, and carry no clinical accountability.",
  "Vets lose time reconstructing history from memory — owners arrive with no structured record of what happened and when.",
];

const productPillars = [
  {
    icon: Stethoscope,
    title: "Deterministic triage core",
    text: "The language model only runs the conversation. Every urgency call (routine / urgent / emergency) is made by a deterministic, test-covered clinical matrix with breed-adjusted risk — never by a free-form LLM answer.",
  },
  {
    icon: Brain,
    title: "Dog Brain memory",
    text: "A longitudinal per-dog memory ranks 60–90 days of follow-ups, supplement trials, and vet records to ask smarter questions each session — with hard guardrails that memory can never lower an emergency signal.",
  },
  {
    icon: Camera,
    title: "Multimodal intake",
    text: "Photo analysis of wounds, rashes, and skin conditions through dedicated vision classifiers, feeding the same structured triage pipeline.",
  },
  {
    icon: FileText,
    title: "Vet handoff, not vet replacement",
    text: "Every session ends in a shareable, vet-ready report: transcript, urgency level, timeline, and suggested questions. We make the vet visit better — we never prescribe or diagnose.",
  },
];

const moats = [
  {
    title: "Safety architecture as a moat",
    text: "Clinical decisions are code, not prompts: a deterministic matrix, hard-fail supplement guardrails (no dosage, brand, or disease claims can ship), and 2,300+ automated tests that prove memory and ranking can never alter an urgency verdict.",
  },
  {
    title: "Longitudinal data flywheel",
    text: "Every session, follow-up, and outcome enriches the dog's structured history, making the next triage measurably smarter — a per-pet record competitors can't cold-start.",
  },
  {
    title: "Multi-model, cost-controlled AI stack",
    text: "NVIDIA NIM open-weight models as the primary path with a second-opinion shadow pipeline logging divergence on every session — quality evaluation built in, no single-vendor lock-in.",
  },
];

const tractionPoints = [
  "Live product in production — web app deployed and usable free, no account required for a first triage.",
  "2,300+ automated tests across 100+ suites, including string-scan safety tests that structurally block dosage, brand, and disease-claim outputs.",
  "Privacy-safe analytics layer: events carry only counts and enums — free text, symptoms, and photos are structurally impossible to log.",
  "CI/CD with an AI clinical-safety review gate on every pull request; auto-deploy to production in minutes.",
];

const businessModel = [
  {
    label: "Model",
    value: "Consumer subscription — PawVital Pro at $9.97/month after a 7-day free trial; one plan covers every dog in the household.",
  },
  {
    label: "Acquisition",
    value: "Free first triage with no signup as the top of funnel; urgency moments convert to subscriptions for history, memory, and reports.",
  },
  {
    label: "Expansion",
    value: "Vet-clinic handoff reports create a B2B2C channel; supplement and insurance partnerships layer on evidence-gated, guardrailed recommendations.",
  },
];

const marketStats = [
  {
    stat: "~65M",
    label: "U.S. households own a dog — the largest pet category (industry estimates)",
  },
  {
    stat: "$150B+",
    label: "annual U.S. pet industry spend, with vet care its fastest-growing segment",
  },
  {
    stat: "24/7",
    label: "demand window — most symptom anxiety happens outside clinic hours",
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
            Investor One-Pager
          </p>
          <h1 className="mt-3 text-4xl font-extrabold text-gray-900 sm:text-5xl">
            The AI triage layer for the family dog
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-xl text-gray-600">
            PawVital tells dog owners, in under a minute, whether a symptom is
            routine, urgent, or an emergency — powered by conversational AI but
            decided by a deterministic clinical engine that never guesses.
          </p>
        </header>

        {/* Problem */}
        <section className="mt-14">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Activity className="h-6 w-6 text-blue-600" />
            The problem
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
            The product
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
            The market
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
            We start with dogs only — the deepest, most emotionally engaged pet
            segment — and go deliberately narrow so the clinical scope stays
            validated. The same triage-plus-memory architecture extends to cats
            and other companion animals as a roadmap expansion, not a pivot.
          </p>
        </section>

        {/* Why we win */}
        <section className="mt-14">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Shield className="h-6 w-6 text-blue-600" />
            Why we win
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
            Business model
          </h2>
          <div className="mt-6 space-y-4">
            {businessModel.map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-1 rounded-2xl bg-gray-50 p-5 sm:flex-row sm:gap-4">
                <span className="w-28 shrink-0 text-sm font-bold uppercase tracking-wide text-blue-600">
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
            Where we are today
          </h2>
          <ul className="mt-4 space-y-3">
            {tractionPoints.map((p) => (
              <li key={p} className="flex items-start gap-3 text-gray-700">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="mt-14 rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-8 text-center sm:p-10">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            See it live — no deck required
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-blue-100">
            The fastest way to evaluate PawVital is to run a triage yourself:
            describe a symptom and watch the deterministic engine work.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://pawvital-ai.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-blue-700 transition-colors hover:bg-blue-50"
            >
              Try the live product
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/contact"
              target="_top"
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-6 py-3 font-semibold text-white transition-colors hover:bg-white/10"
            >
              Contact us
            </Link>
          </div>
        </section>

        <p className="mt-10 text-center text-sm text-gray-500">
          PawVital provides triage support and vet-visit preparation. It is not
          a diagnosis and does not replace professional veterinary care. Market
          figures are third-party industry estimates.
        </p>
      </main>
    </div>
  );
}
