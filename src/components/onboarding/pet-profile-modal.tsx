"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import Button from "@/components/ui/button";
import { useEffect, useRef } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PET_ONBOARDING_DISMISSED_KEY } from "@/lib/demo-storage";
import { useAppStore } from "@/store/app-store";
import { usePets } from "@/hooks/useSupabase";
import type { Pet, PetAgeUnit, PetSpecies } from "@/types";

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
    existing_conditions: [],
    medications: [],
    created_at: now,
    updated_at: now,
  };
}

interface PetProfileModalProps {
  open: boolean;
  /** User skipped or dismissed without saving — session flag + parent state. */
  onSkipped: () => void;
}

export default function PetProfileModal({
  open,
  onSkipped,
}: PetProfileModalProps) {
  const user = useAppStore((s) => s.user);
  const { savePet } = usePets();
  const species: PetSpecies = "dog";
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [ageValue, setAgeValue] = useState("");
  const [ageUnit, setAgeUnit] = useState<PetAgeUnit>("years");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"lbs" | "kg">("lbs");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [breedSuggestions, setBreedSuggestions] = useState<{id: string; name: string}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!breed.trim()) {
      setBreedSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/breeds?species=${species}&q=${encodeURIComponent(breed)}`);
        if (res.ok) {
          const data = await res.json();
          setBreedSuggestions(data.breeds || []);
        }
      } catch (err) {
        console.error("Failed to fetch breeds", err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [breed, species]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Pet name is required";
    if (!breed.trim()) next.breed = "Breed is required";
    const ageNum = parseFloat(ageValue);
    if (Number.isNaN(ageNum) || ageNum < 0) next.age = "Enter a valid age";
    const w = parseFloat(weight);
    if (Number.isNaN(w) || w <= 0) next.weight = "Enter a valid weight";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const markSkipped = () => {
    try {
      sessionStorage.setItem(PET_ONBOARDING_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const handleDismiss = () => {
    markSkipped();
    onSkipped();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const uid =
      user?.id ||
      (isSupabaseConfigured ? "pending" : "demo");
    const pet = onboardingToPet(uid, {
      name,
      species,
      breed,
      ageValue: parseFloat(ageValue),
      ageUnit,
      weight: parseFloat(weight),
      weightUnit,
    });
    try {
      await savePet(pet);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={handleDismiss} title="Add your dog" size="lg">
      <p className="text-sm text-gray-600 mb-4">
        A quick dog profile helps personalize canine health insights. You can add more detail later in Settings.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Dog name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Bailey"
          error={errors.name}
        />
        <div className="relative" ref={suggestionRef}>
          <Input
            label="Breed"
            value={breed}
            onChange={(e) => {
              setBreed(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => {
              if (breed.trim()) setShowSuggestions(true);
            }}
            placeholder="Breed or best description"
            error={errors.breed}
          />
          {showSuggestions && breedSuggestions.length > 0 && (
            <div className="absolute z-10 top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
              {breedSuggestions.map((b) => (
                <div
                  key={b.id}
                  className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm text-gray-700"
                  onClick={() => {
                    setBreed(b.name);
                    setShowSuggestions(false);
                  }}
                >
                  {b.name}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Age"
            type="number"
            min="0"
            step="any"
            value={ageValue}
            onChange={(e) => setAgeValue(e.target.value)}
            placeholder="Number"
            error={errors.age}
          />
          <Select
            label="Age unit"
            value={ageUnit}
            onChange={(e) => setAgeUnit(e.target.value as PetAgeUnit)}
            options={[
              { value: "weeks", label: "Weeks" },
              { value: "months", label: "Months" },
              { value: "years", label: "Years" },
            ]}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Weight"
            type="number"
            min="0"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="Number"
            error={errors.weight}
          />
          <Select
            label="Weight unit"
            value={weightUnit}
            onChange={(e) => setWeightUnit(e.target.value as "lbs" | "kg")}
            options={[
              { value: "lbs", label: "lbs" },
              { value: "kg", label: "kg" },
            ]}
          />
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={handleDismiss}>
            Skip for now
          </Button>
          <Button type="submit" className="w-full sm:flex-1" loading={submitting}>
            Save dog
          </Button>
        </div>
      </form>
    </Modal>
  );
}
