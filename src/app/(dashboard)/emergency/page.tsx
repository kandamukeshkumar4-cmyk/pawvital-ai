"use client";

import Link from "next/link";
import { AlertTriangle, Phone, Stethoscope, ArrowLeft } from "lucide-react";
import { NearestVetFinder } from "@/components/symptom-report/nearest-vet-finder";

/**
 * Emergency signs guidance. Reached from the symptom-checker emergency banner
 * ("View emergency signs"). Calm, high-contrast, scannable — an owner opening
 * this is likely worried, so the red-flags and the "call a vet now" action lead.
 *
 * Static, vetted guidance (not pet-specific) — intentionally not gated on data
 * so it always renders instantly.
 */

const RED_FLAGS: { sign: string; detail: string }[] = [
  { sign: "Trouble breathing", detail: "Labored, noisy, or open-mouth breathing; gums turning blue or pale." },
  { sign: "Collapse or can't stand", detail: "Sudden weakness, fainting, or unable to get up." },
  { sign: "Seizures", detail: "Convulsions, paddling, or loss of consciousness." },
  { sign: "Swollen, hard belly", detail: "A bloated or tense abdomen, especially with retching — can be life-threatening (bloat)." },
  { sign: "Repeated vomiting with retching", detail: "Trying to vomit but nothing comes up, or non-stop vomiting." },
  { sign: "Severe bleeding", detail: "Bleeding that won't stop, or a deep wound." },
  { sign: "Suspected poisoning", detail: "Ate something toxic (chocolate, xylitol, rodenticide, medication, antifreeze)." },
  { sign: "Inability to urinate", detail: "Straining with no output — a urinary blockage is an emergency." },
];

export default function EmergencyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-10">
      <Link
        href="/symptom-checker"
        target="_top"
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#6f7069] transition-colors hover:text-[#1d1d1b]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to symptom check
      </Link>

      {/* Lead action card */}
      <section
        style={{
          background: "linear-gradient(180deg,#fdeeec,#fdf6f4)",
          border: "1px solid #f6dad5",
          borderRadius: 20,
          padding: "26px 28px",
          boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(207,67,56,0.06)",
        }}
      >
        <div className="flex items-start gap-3.5">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: "#fbdfdb", color: "#cf4338" }}
          >
            <AlertTriangle className="h-6 w-6" strokeWidth={1.9} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold leading-tight" style={{ color: "#b23329", letterSpacing: "-0.4px" }}>
              Emergency signs
            </h1>
            <p className="mt-1.5 text-[14.5px] leading-relaxed" style={{ color: "#7a5a56" }}>
              If your dog shows any of the signs below, this is an emergency — contact an
              emergency vet right away. When in doubt, it&apos;s always okay to call.
            </p>
          </div>
        </div>
      </section>

      {/* Red-flag list */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #ececea",
          borderRadius: 20,
          padding: "22px 24px",
          boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.045)",
        }}
      >
        <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest" style={{ color: "#b23329" }}>
          Go to a vet now if you see
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {RED_FLAGS.map((f) => (
            <div
              key={f.sign}
              className="flex gap-2.5"
              style={{ border: "1px solid #f3e3e1", borderRadius: 14, padding: "13px 14px", background: "#fffafa" }}
            >
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{ background: "#fbdfdb", color: "#cf4338" }}
                aria-hidden
              >
                <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
              </span>
              <div className="min-w-0">
                <div className="text-[14.5px] font-semibold" style={{ color: "#1d1d1b" }}>{f.sign}</div>
                <div className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "#6f7069" }}>{f.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Nearest vet finder (real geolocation/maps component) */}
      <NearestVetFinder />

      {/* Reassurance / not-an-emergency path */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #ececea",
          borderRadius: 20,
          padding: "20px 24px",
          boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.045)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "#eaf3ee", color: "#0b7a4d" }}
            >
              <Stethoscope className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </span>
            <div>
              <div className="text-[15px] font-bold" style={{ color: "#1d1d1b" }}>Not sure if it&apos;s urgent?</div>
              <div className="mt-0.5 text-[13.5px]" style={{ color: "#6f7069" }}>
                Run a quick symptom check and PawVital will guide you on what to do next.
              </div>
            </div>
          </div>
          <Link
            href="/symptom-checker"
            target="_top"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors"
            style={{ background: "linear-gradient(180deg,#17a06d,#0a7048)" }}
          >
            <Phone className="h-4 w-4" aria-hidden />
            Start symptom check
          </Link>
        </div>
      </section>

      <p className="px-2 text-center text-xs leading-relaxed" style={{ color: "#8a857a" }}>
        PawVital provides general guidance and is not a diagnosis or a substitute for a
        veterinarian. In a life-threatening emergency, call your nearest emergency vet
        immediately.
      </p>
    </div>
  );
}
