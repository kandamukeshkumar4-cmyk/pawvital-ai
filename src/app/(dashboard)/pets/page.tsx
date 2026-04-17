import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PetDashboardClient } from "./client";
import type { Pet, SymptomCheck } from "@/types";
import { DEMO_HOUSEHOLD_PETS, DEMO_HOUSEHOLD_SYMPTOM_CHECKS } from "@/lib/demo-household-data";

export default async function PetsDashboardPage() {
  let pets: Pet[] = [];
  let checks: SymptomCheck[] = [];
  let isDemo = false;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: p } = await supabase
        .from("pets")
        .select("*")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (p && p.length > 0) {
        const dogPets = (p as Pet[]).filter((pet) => pet.species === "dog");
        pets = dogPets;
        const petIds = dogPets.map((pet) => pet.id);

        if (petIds.length > 0) {
          const { data: c } = await supabase
            .from("symptom_checks")
            .select("*")
            .in("pet_id", petIds)
            .order("created_at", { ascending: false });

          if (c) checks = c as SymptomCheck[];
        }
      }
    }
  } catch {
    isDemo = true;
  }

  if (isDemo) {
    pets = DEMO_HOUSEHOLD_PETS;
    checks = DEMO_HOUSEHOLD_SYMPTOM_CHECKS;
  }

  return <PetDashboardClient initialPets={pets} initialChecks={checks} isDemo={isDemo} />;
}
