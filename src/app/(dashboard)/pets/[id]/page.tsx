"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2, PawPrint, Scale, Calendar } from "lucide-react";
import Card from "@/components/ui/card";
import { HealthTimeline } from "@/components/timeline";
import type { SymptomCheckEntry } from "@/components/timeline/types";
import type { Pet } from "@/types";
import {
  symptomCheckRowToEntry,
  symptomCheckTypeToDbRow,
  type SymptomCheckDbRow,
} from "@/lib/symptom-check-entry-map";
import { DEMO_HOUSEHOLD_PETS, DEMO_HOUSEHOLD_SYMPTOM_CHECKS } from "@/lib/demo-household-data";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";
import { useAppStore } from "@/store/app-store";

function ageLabel(pet: Pet): string {
  if (pet.age_months > 0) {
    return `${pet.age_years}y ${pet.age_months}m`;
  }
  return `${pet.age_years}y`;
}

export default function PetHealthPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { pets } = useAppStore();

  const [pet, setPet] = useState<Pet | null>(null);
  const [checks, setChecks] = useState<SymptomCheckEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    if (!isSupabaseConfigured) {
      const demoPet = DEMO_HOUSEHOLD_PETS.find((p) => p.id === id);
      if (demoPet) {
        setPet(demoPet);
        const sym = DEMO_HOUSEHOLD_SYMPTOM_CHECKS.filter((c) => c.pet_id === id);
        setChecks(
          sym.map((c) => symptomCheckRowToEntry(symptomCheckTypeToDbRow(c), demoPet.name))
        );
        setNotFound(false);
      } else {
        setPet(null);
        setChecks([]);
        setNotFound(true);
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    try {
      const supabase = createClient();
      const { data: petRow, error: petErr } = await supabase
        .from("pets")
        .select("*")
        .eq("id", id)
        .single();

      if (petErr || !petRow) {
        setNotFound(true);
        setPet(null);
        setChecks([]);
        return;
      }

      const p = petRow as Pet;
      setPet(p);

      const { data: rows, error: checkErr } = await supabase
        .from("symptom_checks")
        .select("id, pet_id, symptoms, ai_response, severity, recommendation, created_at")
        .eq("pet_id", id)
        .order("created_at", { ascending: false });

      if (checkErr) throw checkErr;

      const mapped = ((rows ?? []) as SymptomCheckDbRow[]).map((row) =>
        symptomCheckRowToEntry(row, p.name)
      );
      setChecks(mapped);
    } catch (e) {
      console.error("Pet health page load failed:", e);
      setNotFound(true);
      setPet(null);
      setChecks([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const storePet = pets.find((p) => p.id === id);
  const displayPet = pet ?? storePet ?? null;

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-24 text-gray-500 gap-2">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }

  if (notFound || !displayPet) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <Card className="p-8">
          <p className="text-gray-700">We couldn&apos;t find that pet.</p>
          <Link
            href="/pets"
            className="inline-flex mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Back to My pets
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <Link
          href="/pets"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 mb-3 inline-block"
        >
          ← My pets
        </Link>
        <div className="flex items-center gap-2 text-blue-600 mb-1">
          <PawPrint className="h-6 w-6" aria-hidden />
          <span className="text-sm font-semibold uppercase tracking-wide">Pet profile</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{displayPet.name}</h1>
        {!isSupabaseConfigured && (
          <p className="text-xs font-medium text-amber-700 mt-1">Demo profile</p>
        )}
      </div>

      <Card className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Species</p>
            <p className="mt-1 text-gray-900 capitalize">{displayPet.species}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Breed</p>
            <p className="mt-1 text-gray-900">{displayPet.breed}</p>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-gray-400 mt-1 shrink-0" aria-hidden />
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Age</p>
              <p className="mt-1 text-gray-900">{ageLabel(displayPet)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Scale className="h-4 w-4 text-gray-400 mt-1 shrink-0" aria-hidden />
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Weight</p>
              <p className="mt-1 text-gray-900">
                {displayPet.weight} {displayPet.weight_unit}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Health timeline</h2>
        <HealthTimeline checks={checks} />
      </section>
    </div>
  );
}
