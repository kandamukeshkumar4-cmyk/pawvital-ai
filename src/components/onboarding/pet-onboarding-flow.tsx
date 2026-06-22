"use client";

/**
 * Multi-step first-run onboarding flow, rebuilt pixel-for-pixel from the
 * PawVital design slides (welcome → 3 tour steps → "Let's meet your dog" form).
 *
 * Only the final form collects real data, and it reuses the EXACT same pet-save
 * path as the previous modal: `onboardingToPet` → `savePet` (POST /api/pets or
 * demo store) → `onSaved`. Skipping the tour jumps straight to the form; closing
 * without saving sets the dismissed session key via `onSkipped`. The preview
 * content inside the tour steps is illustrative (clearly an example of what the
 * app does), not the user's real data.
 *
 * All colors / px / radii / fonts / copy are copied verbatim from
 * "PawVital AI - Standalone.html" so the rendered flow matches the slides.
 */

import { useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAppStore } from "@/store/app-store";
import { usePets } from "@/hooks/useSupabase";
import type { Pet, PetAgeUnit, PetSpecies } from "@/types";

const FONT_STACK = "'Hanken Grotesk', system-ui, sans-serif";

/* ── Real pet-save mapping (unchanged from pet-profile-modal.tsx) ─────────── */

function onboardingToPet(
  userId: string,
  values: {
    name: string;
    species: PetSpecies;
    breed: string;
    ageValue: number;
    ageUnit: PetAgeUnit;
    weight: number;
    weightUnit: "lbs" | "kg";
    existingConditions: string[];
    medications: string[];
  }
): Pet {
  let ageYears = 0;
  let ageMonths = 0;
  if (values.ageUnit === "years") {
    ageYears = Math.floor(values.ageValue);
    ageMonths = Math.round((values.ageValue - ageYears) * 12);
  } else if (values.ageUnit === "months") {
    ageYears = Math.floor(values.ageValue / 12);
    ageMonths = Math.round(values.ageValue % 12);
  } else {
    const totalMonths = values.ageValue / (52 / 12);
    ageYears = Math.floor(totalMonths / 12);
    ageMonths = Math.round(totalMonths % 12);
  }

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    name: values.name.trim(),
    species: values.species,
    breed: values.breed.trim(),
    age_years: ageYears,
    age_months: ageMonths,
    age_unit: values.ageUnit,
    weight: values.weight,
    weight_unit: values.weightUnit,
    gender: "male",
    is_neutered: true,
    existing_conditions: values.existingConditions,
    medications: values.medications,
    created_at: now,
    updated_at: now,
  };
}

interface PetOnboardingFlowProps {
  open: boolean;
  /** User skipped or dismissed without saving — session flag + parent state. */
  onSkipped: () => void;
  /** Fired after a dog is saved successfully (hands off first-time users to the
   * symptom checker). */
  onSaved?: () => void;
}

/* ── Small inline SVG icons (stroke colors set per-use) ───────────────────── */

function ArrowRight({ size = 18, stroke = "#fff" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ArrowLeft({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function Check({ stroke = "#34C759" }: { stroke?: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      <path d="M20 7 10 17l-5-5" />
    </svg>
  );
}

function HeartShield({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0e8a59" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20s-6.5-4.3-6.5-9.2A3.6 3.6 0 0 1 12 8.4a3.6 3.6 0 0 1 6.5 2.4C18.5 15.7 12 20 12 20z" />
      <path d="M9.2 11.3l1.8 1.8 3.6-3.8" />
    </svg>
  );
}

/* ── Reusable bits ─────────────────────────────────────────────────────────── */

function TourCheckRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, color: "#d4eddb", fontSize: 14.5 }}>
      <Check />
      {children}
    </div>
  );
}

function NavRow({
  step,
  onBack,
  onNext,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <button
        type="button"
        onClick={onBack}
        style={{ display: "flex", alignItems: "center", gap: 7, background: "#f2f2f7", border: "none", borderRadius: 11, padding: "11px 18px", fontSize: 14, fontWeight: 600, color: "#3c3c43", cursor: "pointer", fontFamily: "inherit" }}
      >
        <ArrowLeft />
        Back
      </button>
      <span style={{ fontSize: 13, color: "#aeaeb2" }}>Step {step} of 4</span>
      <button
        type="button"
        onClick={onNext}
        style={{ display: "flex", alignItems: "center", gap: 7, background: "#0b7a4d", border: "none", borderRadius: 11, padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}
      >
        Next
        <ArrowRight size={15} />
      </button>
    </div>
  );
}

const tagPill = (bg: string, color: string): React.CSSProperties => ({
  background: bg,
  color,
  borderRadius: 20,
  padding: "3px 10px",
  fontSize: 11.5,
  fontWeight: 600,
});

/* ── Tour preview cards (illustrative content from the slides) ────────────── */

function TourStep1Preview() {
  // image-2-1: AI Predictions + Signal Graphs
  return (
    <div style={{ flex: 1, padding: "34px 30px", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", color: "#8e8e93", textTransform: "uppercase", marginBottom: 10 }}>
        AI Predictions + Signal Graphs
      </div>

      {/* Brain Prediction card */}
      <div style={{ background: "#fafaf7", border: "1.5px solid #e8e7e2", borderRadius: 14, padding: "13px 15px", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34C759", flex: "none", display: "inline-block" }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.4px", color: "#8e8e93", textTransform: "uppercase" }}>Brain Prediction</span>
          <span style={{ fontSize: 11, color: "#aeaeb2", marginLeft: "auto" }}>Based on 14 logs</span>
        </div>
        <div style={{ fontSize: 16.5, fontWeight: 700, color: "#1c1c1e", marginBottom: 5 }}>Mild GI pattern detected</div>
        <div style={{ fontSize: 13, color: "#6c6c70", lineHeight: 1.45, marginBottom: 9 }}>
          Appetite ↓ 3 days + stool change 2 days — consistent with early digestive upset.
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={tagPill("#fdf3e3", "#b5740a")}>Watch</span>
          <span style={tagPill("#e9f6ef", "#0b7a4d")}>Low urgency</span>
          <span style={tagPill("#f2f2f7", "#6c6c70")}>GI focus</span>
        </div>
      </div>

      {/* 2-col signal charts */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, border: "1px solid #EDE5C8", borderRadius: 13, padding: "10px 12px", background: "#FDFAF3" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#1c1c1e" }}>Appetite</span>
            <span style={{ background: "#fdf3e3", color: "#b5740a", fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 6 }}>↓ Watch</span>
          </div>
          <svg width="100%" height="42" viewBox="0 0 118 42" fill="none" preserveAspectRatio="none">
            {[26, 22, 28, 18, 24, 14, 20, 12, 16, 9].map((h, i) => (
              <rect key={i} x={2 + i * 11.6} y={42 - h} width="7.5" height={h} rx="2" fill="#e0890a" opacity={0.55 + i * 0.045} />
            ))}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 9.5, color: "#aeaeb2" }}>7d ago</span>
            <span style={{ fontSize: 9.5, color: "#aeaeb2" }}>Today</span>
          </div>
        </div>
        <div style={{ flex: 1, border: "1px solid #D0DCF0", borderRadius: 13, padding: "10px 12px", background: "#F5F8FD" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#1c1c1e" }}>Weight</span>
            <span style={{ background: "#dde8f5", color: "#4d7cb5", fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 6 }}>−0.4 kg</span>
          </div>
          <svg width="100%" height="42" viewBox="0 0 118 42" fill="none" preserveAspectRatio="none">
            <line x1="0" y1="11" x2="118" y2="11" stroke="#e7eef8" strokeWidth="1" />
            <line x1="0" y1="31" x2="118" y2="31" stroke="#e7eef8" strokeWidth="1" />
            <polyline points="2,16 30,15 58,20 86,26 116,30" fill="none" stroke="#4d7cb5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 9.5, color: "#aeaeb2" }}>28.4 kg</span>
            <span style={{ fontSize: 9.5, color: "#aeaeb2" }}>27.8 kg</span>
          </div>
        </div>
      </div>

      {/* Suggested next steps */}
      <div style={{ background: "#f5f5f7", borderRadius: 13, padding: "11px 14px", flex: 1 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.4px", color: "#8e8e93", textTransform: "uppercase", marginBottom: 8 }}>
          Suggested next steps
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {["Start a symptom check for Bruno", "Log appetite and stool tonight", "Answer the probiotic follow-up"].map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#e9f6ef", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0b7a4d" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
              <span style={{ fontSize: 13, color: "#1c1c1e", fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TourStep2Preview() {
  // image-3-1: How the Symptom Checker works
  const uppercaseLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.4px", color: "#8e8e93", textTransform: "uppercase" };
  return (
    <div style={{ flex: 1, padding: "28px 28px", display: "flex", flexDirection: "column", gap: 10, overflow: "auto" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", color: "#8e8e93", textTransform: "uppercase", marginBottom: 2 }}>
        How the Symptom Checker works
      </div>

      {/* Brain uses past data */}
      <div style={{ background: "#fafaf7", border: "1px solid #ebeae5", borderRadius: 13, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34C759", display: "inline-block", flex: "none" }} />
          <span style={uppercaseLabel}>Brain uses 90-day memory</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1c1c1e", marginBottom: 4 }}>Why I&apos;m asking — not guesswork</div>
        <div style={{ background: "#f0f5fb", borderRadius: 9, padding: "9px 11px", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4d7cb5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: 1 }}>
            <path d="M12 2.8 5 5.5v5.5c0 4.6 3 7.8 7 9.2 4-1.4 7-4.6 7-9.2V5.5z" />
          </svg>
          <div style={{ fontSize: 12.5, color: "#3a5a82", lineHeight: 1.45 }}>
            <span style={{ fontWeight: 600 }}>Why I&apos;m asking:</span> Bruno&apos;s logs show appetite dropped 3 days ago and stool changed 2 days ago. These two signals together suggest early GI upset — confirming timing helps date the pattern.
          </div>
        </div>
      </div>

      {/* Pattern + supplement */}
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, background: "#fdfaf3", border: "1px solid #EDE5C8", borderRadius: 13, padding: "11px 13px" }}>
          <div style={{ ...uppercaseLabel, marginBottom: 6 }}>Pattern detected</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1c1c1e", marginBottom: 4 }}>Mild GI upset</div>
          <div style={{ fontSize: 12, color: "#6c6c70", lineHeight: 1.4, marginBottom: 7 }}>Appetite + stool + prior report all align. Consistent with early digestive disturbance.</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span style={{ background: "#fdf3e3", color: "#b5740a", borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>Watch</span>
            <span style={{ background: "#e9f6ef", color: "#0b7a4d", borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>Low urgency</span>
          </div>
        </div>
        <div style={{ flex: 1, background: "#f5f8fd", border: "1px solid #D0DCF0", borderRadius: 13, padding: "11px 13px" }}>
          <div style={{ ...uppercaseLabel, marginBottom: 6 }}>Supplement suggestion</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "#eef2ea", display: "flex", alignItems: "center", justifyContent: "center", color: "#6f8a5c", flex: "none" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.6 3.4 3.4 10.6a4.1 4.1 0 0 0 5.8 5.8l7.2-7.2a4.1 4.1 0 1 0-5.8-5.8z" />
                <path d="M7.8 7.8l4.6 4.6" />
              </svg>
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1c1c1e" }}>Probiotic</span>
          </div>
          <div style={{ fontSize: 12, color: "#6c6c70", lineHeight: 1.4 }}>GI pattern suggests gut microbiome imbalance. A probiotic may help — ask your vet first.</div>
          <div style={{ fontSize: 11, color: "#aeaeb2", marginTop: 5 }}>Always vet-approved before starting</div>
        </div>
      </div>

      {/* Feedback loop */}
      <div style={{ background: "#fafaf7", border: "1px solid #ebeae5", borderRadius: 13, padding: "11px 13px" }}>
        <div style={{ ...uppercaseLabel, marginBottom: 7 }}>Feedback loop — AI learns from you</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: "1px solid #ebeae5", borderRadius: 10, padding: "9px 11px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e0890a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 1.8" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1c1c1e" }}>3 days ago — appetite changed</div>
              <div style={{ fontSize: 11.5, color: "#6c6c70" }}>Is Bruno better, same, or worse?</div>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <span style={{ background: "#e9f6ef", color: "#0b7a4d", borderRadius: 7, padding: "3px 8px", fontSize: 11.5, fontWeight: 600 }}>Better</span>
              <span style={{ background: "#fdf3e3", color: "#b5740a", borderRadius: 7, padding: "3px 8px", fontSize: 11.5, fontWeight: 600 }}>Same</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: "1px solid #ebeae5", borderRadius: 10, padding: "9px 11px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0b7a4d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.6 3.4 3.4 10.6a4.1 4.1 0 0 0 5.8 5.8l7.2-7.2a4.1 4.1 0 1 0-5.8-5.8z" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1c1c1e" }}>Probiotic started May 18</div>
              <div style={{ fontSize: 11.5, color: "#6c6c70" }}>Any stool improvement?</div>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <span style={{ background: "#e9f6ef", color: "#0b7a4d", borderRadius: 7, padding: "3px 8px", fontSize: 11.5, fontWeight: 600 }}>Yes</span>
              <span style={{ background: "#f2f2f7", color: "#6c6c70", borderRadius: 7, padding: "3px 8px", fontSize: 11.5, fontWeight: 600 }}>No</span>
            </div>
          </div>
        </div>
      </div>

      {/* What to do next */}
      <div style={{ background: "#0b2417", borderRadius: 13, padding: "11px 14px" }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.4px", color: "#6fb88a", textTransform: "uppercase", marginBottom: 7 }}>What to do next</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {[
            { active: true, label: "Start a symptom check — 5 focused questions" },
            { active: false, label: "Log appetite & stool tonight to close the loop" },
            { active: false, label: "Share the Brain summary with your vet" },
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: row.active ? "#0b7a4d" : "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={row.active ? "#fff" : "#6fb88a"} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
              <span style={{ fontSize: 12.5, color: "#d4eddb", fontWeight: 500 }}>{row.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  date,
  dateColor,
  dotColor,
  dotHollow,
  showLine,
  title,
  titleColor,
  subtitle,
}: {
  date: string;
  dateColor: string;
  dotColor: string;
  dotHollow?: boolean;
  showLine: boolean;
  title: string;
  titleColor: string;
  subtitle: string;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ width: 44, textAlign: "right", paddingTop: 2, flex: "none" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: dateColor }}>{date}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none", width: 15 }}>
        <div
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: dotHollow ? "#fff" : dotColor,
            border: dotHollow ? `2px solid ${dotColor}` : undefined,
            marginTop: 2,
            flex: "none",
          }}
        />
        {showLine && <div style={{ width: 1.5, flex: 1, background: "#e5e5ea", minHeight: 18, marginTop: 2 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: showLine ? 12 : 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: titleColor }}>{title}</div>
        <div style={{ fontSize: 12, color: "#6c6c70", marginTop: 1 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function TourStep3Preview() {
  // image-4-1: The Brain builds a timeline automatically
  return (
    <div style={{ flex: 1, padding: "30px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", color: "#8e8e93", textTransform: "uppercase", marginBottom: 4 }}>
        The Brain builds a timeline automatically
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "#fafaf7", borderRadius: 14, padding: "16px 18px" }}>
        <TimelineRow date="May 15" dateColor="#8e8e93" dotColor="#FF9F0A" showLine title="Appetite reduced" titleColor="#1c1c1e" subtitle="Detected from daily logs" />
        <TimelineRow date="May 16" dateColor="#8e8e93" dotColor="#4d7cb5" showLine title="Stool photo + symptom check" titleColor="#1c1c1e" subtitle="Mild GI upset · Low urgency" />
        <TimelineRow date="Today" dateColor="#0b7a4d" dotColor="#e0890a" dotHollow showLine={false} title="Follow-up due" titleColor="#e0890a" subtitle="Waiting for your answer" />
      </div>
      <div style={{ background: "#f2f2f7", borderRadius: 14, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: "#eef2ea", display: "flex", alignItems: "center", justifyContent: "center", color: "#6f8a5c", flex: "none" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 3h7l4 4v14H7z" />
            <path d="M14 3v4h4" />
            <path d="M10 13h5M10 16.5h5" />
          </svg>
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1c1c1e" }}>Vet Summary</div>
          <div style={{ fontSize: 12.5, color: "#6c6c70" }}>42 logs · 6 photos · 3 symptom checks</div>
        </div>
        <span style={{ background: "#0b7a4d", color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>Create →</span>
      </div>
    </div>
  );
}

/* ── Tour shell (dark left panel + white right panel) ─────────────────────── */

interface TourLeftPanel {
  bg: string;
  eyebrow: string;
  eyebrowColor: string;
  heading: React.ReactNode;
  bullets?: string[];
  paragraph?: string;
  paragraphColor?: string;
  footnote: {
    bg?: string;
    titleColor: string;
    title: string;
    bodyColor: string;
    body: string;
  };
}

function TourCard({
  left,
  children,
  step,
  onBack,
  onNext,
}: {
  left: TourLeftPanel;
  children: React.ReactNode;
  step: number;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div style={{ background: "#fff", borderRadius: 24, width: 900, maxWidth: "calc(100vw - 32px)", display: "flex", overflow: "hidden", boxShadow: "0 32px 100px rgba(0,0,0,.55)" }}>
      {/* Left dark panel */}
      <div style={{ width: 330, flex: "none", background: left.bg, padding: "42px 34px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.8px", color: left.eyebrowColor, textTransform: "uppercase", marginBottom: 18 }}>
            {left.eyebrow}
          </div>
          <h2 style={{ fontSize: 31, fontWeight: 800, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1.15, margin: "0 0 22px" }}>
            {left.heading}
          </h2>
          {left.bullets && (
            <div style={{ display: "flex", flexDirection: "column", gap: left.bullets.length > 3 ? 12 : 13 }}>
              {left.bullets.map((b, i) => (
                <TourCheckRow key={i}>{b}</TourCheckRow>
              ))}
            </div>
          )}
          {left.paragraph && (
            <p style={{ fontSize: 15, color: left.paragraphColor, lineHeight: 1.6, margin: 0 }}>{left.paragraph}</p>
          )}
        </div>
        <div style={{ background: left.footnote.bg ?? "rgba(255,255,255,.08)", borderRadius: 12, padding: "13px 15px", marginTop: 28 }}>
          <div style={{ fontSize: 12.5, color: left.footnote.titleColor, fontWeight: left.footnote.bg ? 700 : 600, marginBottom: left.footnote.bg ? 5 : 4 }}>
            {left.footnote.title}
          </div>
          <div style={{ fontSize: 13.5, color: left.footnote.bodyColor, lineHeight: 1.45 }}>{left.footnote.body}</div>
        </div>
      </div>
      {/* Right white panel */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {children}
        <div style={{ padding: "0 30px 30px" }}>
          <NavRow step={step} onBack={onBack} onNext={onNext} />
        </div>
      </div>
    </div>
  );
}

/* ── Step dots (top center) ──────────────────────────────────────────────── */

function StepDots({ step }: { step: number }) {
  // step 1 = welcome (not shown here); dots show for steps 2..5
  const dot = (n: number): React.CSSProperties => ({
    width: 9,
    height: 9,
    borderRadius: "50%",
    display: "inline-block",
    background: step === n ? "#0b7a4d" : step > n ? "#6fb88a" : "rgba(255,255,255,.3)",
  });
  return (
    <div style={{ position: "absolute", top: 30, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={dot(n)} />
      ))}
    </div>
  );
}

/* ── Main flow ───────────────────────────────────────────────────────────── */

export default function PetOnboardingFlow({ open, onSkipped, onSaved }: PetOnboardingFlowProps) {
  const user = useAppStore((s) => s.user);
  const { savePet } = usePets();

  // step 1 = welcome, 2/3/4 = tour, 5 = form
  const [step, setStep] = useState(1);

  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [ageValue, setAgeValue] = useState("");
  const [weight, setWeight] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!open) return null;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Dog's name is required";
    if (!breed.trim()) next.breed = "Breed is required";
    const ageNum = parseFloat(ageValue);
    if (Number.isNaN(ageNum) || ageNum < 0) next.age = "Enter a valid age";
    const w = parseFloat(weight);
    if (Number.isNaN(w) || w <= 0) next.weight = "Enter a valid weight";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSaveError(null);
    const uid = user?.id || (isSupabaseConfigured ? "pending" : "demo");
    // ageUnit fixed to "years" and weightUnit fixed to "kg" to match the slide
    // form ("Age (years)" / "Weight (kg)"). Conditions / medications are not on
    // this slide; default to empty arrays — same payload shape as before.
    const pet = onboardingToPet(uid, {
      name,
      species: "dog",
      breed,
      ageValue: parseFloat(ageValue),
      ageUnit: "years",
      weight: parseFloat(weight),
      weightUnit: "kg",
      existingConditions: [],
      medications: [],
    });
    try {
      await savePet(pet);
      onSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save dog profile. Please try again.";
      setSaveError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── STEP 1: Welcome (full opaque white) ───────────────────────────────── */
  if (step === 1) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, fontFamily: FONT_STACK }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 50 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: "#e9f6ef", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <HeartShield />
          </div>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.4px" }}>
            PawVital <span style={{ color: "#0e8a59" }}>AI</span>
          </span>
        </div>
        <h1 style={{ fontSize: 58, fontWeight: 800, letterSpacing: "-2px", lineHeight: 1.05, margin: "0 0 22px", color: "#1c1c1e", textAlign: "center", maxWidth: 680 }}>
          Your dog&apos;s health,<br />finally organized.
        </h1>
        <p style={{ fontSize: 19, color: "#6c6c70", textAlign: "center", maxWidth: 500, lineHeight: 1.6, margin: "0 0 40px" }}>
          PawVital AI builds a 90-day memory of your dog&apos;s health — spotting patterns early and telling you exactly what to do next.
        </p>
        <div style={{ display: "flex", gap: 10, marginBottom: 46, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, background: "#f2f2f7", color: "#3c3c43", borderRadius: 20, padding: "8px 15px", fontSize: 13.5, fontWeight: 600 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0b7a4d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></svg>
            90-day memory
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, background: "#f2f2f7", color: "#3c3c43", borderRadius: 20, padding: "8px 15px", fontSize: 13.5, fontWeight: 600 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0b7a4d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" /></svg>
            Pattern detection
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, background: "#f2f2f7", color: "#3c3c43", borderRadius: 20, padding: "8px 15px", fontSize: 13.5, fontWeight: 600 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0b7a4d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M10 13h5" /></svg>
            Vet-ready reports
          </span>
        </div>
        <button
          type="button"
          onClick={() => setStep(2)}
          style={{ display: "flex", alignItems: "center", gap: 10, background: "#0b7a4d", color: "#fff", border: "none", borderRadius: 14, padding: "17px 36px", fontSize: 17, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.2px", boxShadow: "0 4px 20px rgba(11,122,77,.3)" }}
        >
          Get started
          <ArrowRight />
        </button>
        <p style={{ fontSize: 13, color: "#aeaeb2", marginTop: 16 }}>Takes 2 minutes · No diagnosis, just memory</p>
      </div>
    );
  }

  /* ── STEPS 2-5: blurred backdrop + modal ───────────────────────────────── */
  const back = () => setStep((s) => Math.max(1, s - 1));
  const next = () => setStep((s) => Math.min(5, s + 1));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(28,28,30,.74)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT_STACK }}>
      <StepDots step={step} />
      <button
        type="button"
        onClick={onSkipped}
        style={{ position: "absolute", top: 22, right: 28, background: "rgba(255,255,255,.14)", border: "none", borderRadius: 9, padding: "7px 15px", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: "inherit", letterSpacing: 0 }}
      >
        Skip tour
      </button>

      {/* STEP 2 — The Dog Brain (Step 1 of 4) */}
      {step === 2 && (
        <TourCard
          step={1}
          onBack={back}
          onNext={next}
          left={{
            bg: "#0b2417",
            eyebrow: "The Dog Brain",
            eyebrowColor: "#6fb88a",
            heading: (<>It remembers<br />everything,<br />so you don&apos;t.</>),
            bullets: [
              "90-day logs, photos & vet records",
              "Active supplements & reminders",
              "Open follow-ups & symptom checks",
              "Vet-ready summary on demand",
            ],
            footnote: {
              titleColor: "#6fb88a",
              title: "After 14 daily logs:",
              bodyColor: "#d4eddb",
              body: "“Appetite reduced 3 days + stool changed — pattern detected.”",
            },
          }}
        >
          <TourStep1Preview />
        </TourCard>
      )}

      {/* STEP 3 — Symptom Checker (Step 2 of 4) */}
      {step === 3 && (
        <TourCard
          step={2}
          onBack={back}
          onNext={next}
          left={{
            bg: "#0d1a3a",
            eyebrow: "Symptom Checker",
            eyebrowColor: "#6b8ec9",
            heading: "The AI that knows Bruno's full history.",
            bullets: [
              "Uses 90-day memory to predict disease patterns",
              "Suggests supplements for vitamin & nutrient gaps",
              "Learns from your feedback on last symptoms",
              "Tells you exactly what to do next",
            ],
            footnote: {
              titleColor: "#6b8ec9",
              title: "How it works:",
              bodyColor: "#a8c0e8",
              body: "You log each day → the Brain builds the chart → you see the pattern.",
            },
          }}
        >
          <TourStep2Preview />
        </TourCard>
      )}

      {/* STEP 4 — Brain Story + Vet Report (Step 3 of 4) */}
      {step === 4 && (
        <TourCard
          step={3}
          onBack={back}
          onNext={next}
          left={{
            bg: "#1a0e2e",
            eyebrow: "Brain Story + Vet Report",
            eyebrowColor: "#9b7dc9",
            heading: "One tap to share a vet-ready summary.",
            paragraph: "Every log, photo, symptom check, and supplement compiled into a report your vet can actually use.",
            paragraphColor: "#c4aef0",
            footnote: {
              bg: "rgba(255,255,255,.08)",
              titleColor: "#9b7dc9",
              title: "Not a diagnosis.",
              bodyColor: "#c4aef0",
              body: "PawVital helps organize patterns for you and your vet. Always follow your vet's guidance.",
            },
          }}
        >
          <TourStep3Preview />
        </TourCard>
      )}

      {/* STEP 5 — Let's meet your dog (Step 4 of 4) — REAL SAVE */}
      {step === 5 && (
        <div style={{ background: "#fff", borderRadius: 24, width: 560, maxWidth: "calc(100vw - 32px)", padding: "50px 48px", boxShadow: "0 32px 100px rgba(0,0,0,.55)", textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "#e9f6ef", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 22px" }}>
            <HeartShield />
          </div>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.7px", margin: "0 0 8px", color: "#1c1c1e" }}>Let&apos;s meet your dog.</h2>
          <p style={{ fontSize: 15, color: "#6c6c70", margin: "0 0 30px", lineHeight: 1.5 }}>Add the basics — you can edit everything later.</p>
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, textAlign: "left", marginBottom: 22 }}>
              <FormField label="Dog's name" placeholder="e.g. Bruno" value={name} onChange={setName} error={errors.name} />
              <FormField label="Breed" placeholder="e.g. German Shepherd" value={breed} onChange={setBreed} error={errors.breed} />
              <FormField label="Age (years)" placeholder="e.g. 2" value={ageValue} onChange={setAgeValue} error={errors.age} inputMode="decimal" />
              <FormField label="Weight (kg)" placeholder="e.g. 28.4" value={weight} onChange={setWeight} error={errors.weight} inputMode="decimal" />
            </div>
            {saveError && (
              <p style={{ fontSize: 13, color: "#d92d20", margin: "0 0 14px", textAlign: "left" }} role="alert">{saveError}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", background: "#0b7a4d", color: "#fff", border: "none", borderRadius: 14, padding: 17, fontSize: 17, fontWeight: 700, cursor: submitting ? "default" : "pointer", fontFamily: "inherit", letterSpacing: "-0.2px", boxShadow: "0 4px 20px rgba(11,122,77,.25)", opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? "Saving…" : "Start exploring PawVital"}
              {!submitting && <ArrowRight />}
            </button>
          </form>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 }}>
            <button type="button" onClick={back} style={{ background: "none", border: "none", color: "#8e8e93", fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
            <span style={{ color: "#d1d1d6" }}>·</span>
            <span style={{ fontSize: 13, color: "#aeaeb2" }}>Step 4 of 4</span>
            <span style={{ color: "#d1d1d6" }}>·</span>
            <span style={{ fontSize: 13, color: "#aeaeb2" }}>You can edit anytime</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Form field (matches slide input styling) ────────────────────────────── */

function FormField({
  label,
  placeholder,
  value,
  onChange,
  error,
  inputMode,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  inputMode?: "decimal";
}) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#3c3c43", display: "block", marginBottom: 6 }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        style={{
          width: "100%",
          border: `1.5px solid ${error ? "#d92d20" : "#e5e5ea"}`,
          borderRadius: 11,
          padding: "12px 14px",
          fontSize: 15,
          color: "#1c1c1e",
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {error && <span style={{ fontSize: 11.5, color: "#d92d20", marginTop: 4, display: "block" }}>{error}</span>}
    </div>
  );
}
