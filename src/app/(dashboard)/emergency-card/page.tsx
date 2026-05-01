"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import {
  Share2,
  Copy,
  Check,
  Phone,
  AlertTriangle,
  Pill,
  Heart,
  Shield,
  Printer,
  QrCode,
  Edit3,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import type { Pet } from "@/types";

interface EmergencyExtras {
  vetName: string;
  vetPhone: string;
  ownerName: string;
  ownerPhone: string;
  allergies: string;
  lastMealTime: string;
  vaccineStatus: string;
  additionalNotes: string;
}

const DEFAULT_EXTRAS: EmergencyExtras = {
  vetName: "",
  vetPhone: "",
  ownerName: "",
  ownerPhone: "",
  allergies: "",
  lastMealTime: "",
  vaccineStatus: "Up to date",
  additionalNotes: "",
};

function ageString(pet: Pet): string {
  if (pet.age_months > 0) {
    return `${pet.age_years} years ${pet.age_months} months`;
  }
  return `${pet.age_years} years`;
}

function buildEmergencyText(pet: Pet, extras: EmergencyExtras): string {
  const lines: string[] = [];
  lines.push("🚨 EMERGENCY PET PROFILE — PawVital");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push(`🐕 ${pet.name}`);
  lines.push(`   Breed: ${pet.breed}`);
  lines.push(`   Age: ${ageString(pet)}`);
  lines.push(`   Weight: ${pet.weight} ${pet.weight_unit}`);
  lines.push(`   Sex: ${pet.gender}${pet.is_neutered ? " (neutered)" : ""}`);

  if (pet.existing_conditions.length > 0) {
    lines.push("");
    lines.push("⚕️ CONDITIONS:");
    pet.existing_conditions.forEach((c) => lines.push(`   • ${c}`));
  }

  if (pet.medications.length > 0) {
    lines.push("");
    lines.push("💊 MEDICATIONS:");
    pet.medications.forEach((m) => lines.push(`   • ${m}`));
  }

  if (extras.allergies.trim()) {
    lines.push("");
    lines.push(`⚠️ ALLERGIES: ${extras.allergies}`);
  }

  lines.push("");
  lines.push(`💉 VACCINES: ${extras.vaccineStatus}`);

  if (extras.lastMealTime.trim()) {
    lines.push(`🍽️ LAST MEAL: ${extras.lastMealTime}`);
  }

  if (extras.vetName.trim() || extras.vetPhone.trim()) {
    lines.push("");
    lines.push("🏥 VET CONTACT:");
    if (extras.vetName.trim()) lines.push(`   ${extras.vetName}`);
    if (extras.vetPhone.trim()) lines.push(`   ${extras.vetPhone}`);
  }

  if (extras.ownerName.trim() || extras.ownerPhone.trim()) {
    lines.push("");
    lines.push("👤 OWNER CONTACT:");
    if (extras.ownerName.trim()) lines.push(`   ${extras.ownerName}`);
    if (extras.ownerPhone.trim()) lines.push(`   ${extras.ownerPhone}`);
  }

  if (extras.additionalNotes.trim()) {
    lines.push("");
    lines.push("📝 NOTES:");
    lines.push(`   ${extras.additionalNotes}`);
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`Generated ${new Date().toLocaleDateString()} by PawVital AI`);

  return lines.join("\n");
}

function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Heart;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      {Icon && <Icon className="mt-0.5 h-4 w-4 text-gray-400 shrink-0" />}
      <div className="min-w-0">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </span>
        <p className="text-sm text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function EmergencyCardPreview({
  pet,
  extras,
}: {
  pet: Pet;
  extras: EmergencyExtras;
}) {
  return (
    <div className="rounded-2xl border-2 border-red-200 bg-white overflow-hidden shadow-lg print:shadow-none print:border-red-300">
      {/* Red header strip */}
      <div className="bg-red-600 px-5 py-3 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-white" />
        <span className="text-sm font-bold text-white tracking-wide uppercase">
          Emergency Pet Profile
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Pet identity */}
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl">
            🐕
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">{pet.name}</h3>
            <p className="text-sm text-gray-600">
              {pet.breed} · {ageString(pet)} · {pet.weight} {pet.weight_unit}
            </p>
            <p className="text-xs text-gray-500">
              {pet.gender}{pet.is_neutered ? ", neutered" : ""}
            </p>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Conditions */}
        {pet.existing_conditions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Known Conditions
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pet.existing_conditions.map((c) => (
                <Badge key={c} variant="warning">
                  {c}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Medications */}
        {pet.medications.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Pill className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Current Medications
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pet.medications.map((m) => (
                <Badge key={m} variant="info">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Allergies */}
        {extras.allergies.trim() && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Allergies
              </span>
            </div>
            <p className="text-sm text-red-800 font-medium">
              {extras.allergies}
            </p>
          </div>
        )}

        <hr className="border-gray-100" />

        {/* Quick facts */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <InfoRow label="Vaccines" value={extras.vaccineStatus} />
          <InfoRow label="Last Meal" value={extras.lastMealTime} />
        </div>

        {/* Contacts */}
        {(extras.vetName || extras.vetPhone) && (
          <div className="rounded-xl bg-blue-50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-semibold text-blue-900 uppercase tracking-wide">
                Vet Contact
              </span>
            </div>
            {extras.vetName && (
              <p className="text-sm text-blue-900">{extras.vetName}</p>
            )}
            {extras.vetPhone && (
              <a
                href={`tel:${extras.vetPhone}`}
                className="text-sm text-blue-700 font-semibold underline"
              >
                {extras.vetPhone}
              </a>
            )}
          </div>
        )}

        {(extras.ownerName || extras.ownerPhone) && (
          <div className="rounded-xl bg-gray-50 p-3">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Owner
            </span>
            {extras.ownerName && (
              <p className="text-sm text-gray-900">{extras.ownerName}</p>
            )}
            {extras.ownerPhone && (
              <a
                href={`tel:${extras.ownerPhone}`}
                className="text-sm text-blue-700 font-semibold underline"
              >
                {extras.ownerPhone}
              </a>
            )}
          </div>
        )}

        {extras.additionalNotes.trim() && (
          <div className="rounded-xl bg-amber-50 p-3">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
              Notes
            </span>
            <p className="text-sm text-amber-900 mt-1">
              {extras.additionalNotes}
            </p>
          </div>
        )}
      </div>

      <div className="bg-gray-50 px-5 py-2 text-center">
        <p className="text-[10px] text-gray-400">
          Generated by PawVital AI · {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "tel" | "textarea";
}) {
  const baseClass =
    "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1 block">
        {label}
      </label>
      {type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={`${baseClass} resize-none`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={baseClass}
        />
      )}
    </div>
  );
}

export default function EmergencyCardPage() {
  const { activePet } = useAppStore();
  const [extras, setExtras] = useState<EmergencyExtras>(DEFAULT_EXTRAS);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  const pet: Pet = useMemo(
    () =>
      activePet ?? {
        id: "demo",
        user_id: "demo",
        name: "Your Dog",
        species: "dog",
        breed: "Unknown",
        age_years: 7,
        age_months: 0,
        weight: 50,
        weight_unit: "lbs",
        gender: "male",
        is_neutered: true,
        existing_conditions: ["Arthritis"],
        medications: ["Carprofen", "Glucosamine"],
        created_at: "",
        updated_at: "",
      },
    [activePet],
  );

  const updateField = useCallback(
    (field: keyof EmergencyExtras, value: string) => {
      setExtras((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const emergencyText = useMemo(
    () => buildEmergencyText(pet, extras),
    [pet, extras],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(emergencyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = emergencyText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [emergencyText]);

  const handleShare = useCallback(async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${pet.name} — Emergency Pet Profile`,
          text: emergencyText,
        });
      } catch {
        handleCopy();
      }
    } else {
      handleCopy();
    }
  }, [pet.name, emergencyText, handleCopy]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white">
            <QrCode className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Emergency Share Card
            </h1>
            <p className="text-sm text-gray-500">
              One-tap shareable emergency profile for {pet.name}
            </p>
          </div>
        </div>
        <p className="text-gray-600 text-sm mt-2">
          Create an emergency card with {pet.name}&apos;s critical info —
          conditions, meds, allergies, vet contact. Share it with your
          emergency vet, pet sitter, or family in seconds.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Edit form */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-gray-500" />
                Additional Details
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Hide" : "Edit"}
              </Button>
            </div>

            {editing && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <EditField
                    label="Your Name"
                    value={extras.ownerName}
                    onChange={(v) => updateField("ownerName", v)}
                    placeholder="Jane Smith"
                  />
                  <EditField
                    label="Your Phone"
                    value={extras.ownerPhone}
                    onChange={(v) => updateField("ownerPhone", v)}
                    placeholder="(555) 123-4567"
                    type="tel"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <EditField
                    label="Vet Name / Clinic"
                    value={extras.vetName}
                    onChange={(v) => updateField("vetName", v)}
                    placeholder="Dr. Wilson — Happy Paws Vet"
                  />
                  <EditField
                    label="Vet Phone"
                    value={extras.vetPhone}
                    onChange={(v) => updateField("vetPhone", v)}
                    placeholder="(555) 987-6543"
                    type="tel"
                  />
                </div>
                <EditField
                  label="Allergies"
                  value={extras.allergies}
                  onChange={(v) => updateField("allergies", v)}
                  placeholder="e.g. Chicken, Penicillin"
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <EditField
                    label="Last Meal"
                    value={extras.lastMealTime}
                    onChange={(v) => updateField("lastMealTime", v)}
                    placeholder="e.g. 6:00 PM today"
                  />
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Vaccine Status
                    </label>
                    <select
                      value={extras.vaccineStatus}
                      onChange={(e) =>
                        updateField("vaccineStatus", e.target.value)
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option>Up to date</option>
                      <option>Overdue</option>
                      <option>Partially vaccinated</option>
                      <option>Unknown</option>
                    </select>
                  </div>
                </div>
                <EditField
                  label="Additional Notes"
                  value={extras.additionalNotes}
                  onChange={(v) => updateField("additionalNotes", v)}
                  placeholder="e.g. Anxious around strangers, needs gentle handling"
                  type="textarea"
                />
              </div>
            )}
          </Card>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 sm:flex-row print:hidden">
            <Button onClick={handleShare} className="w-full sm:w-auto">
              <Share2 className="mr-2 h-4 w-4" />
              Share Card
            </Button>
            <Button
              variant="outline"
              onClick={handleCopy}
              className="w-full sm:w-auto"
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy as Text
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={handlePrint}
              className="w-full sm:w-auto"
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        {/* Card preview */}
        <div ref={cardRef}>
          <EmergencyCardPreview pet={pet} extras={extras} />
        </div>
      </div>

      {/* Usage tips */}
      <Card className="p-4 border-amber-200 bg-amber-50 print:hidden">
        <h3 className="text-sm font-semibold text-amber-900 mb-2">
          When to use this card:
        </h3>
        <ul className="space-y-1 text-sm text-amber-800">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-600 shrink-0" />
            Share with your pet sitter before you travel
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-600 shrink-0" />
            Text it to the emergency vet while you&apos;re on the way
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-600 shrink-0" />
            Give a printed copy to a family member or dog walker
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-600 shrink-0" />
            Keep one in your car for road trips with your dog
          </li>
        </ul>
      </Card>
    </div>
  );
}
