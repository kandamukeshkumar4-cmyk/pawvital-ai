"use client";

import { useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { buildLoginPath, buildRedirectTarget } from "@/lib/auth-routing";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";
import { DEMO_PETS_STORAGE_KEY } from "@/lib/demo-storage";
import { useAppStore } from "@/store/app-store";
import type { Pet, UserProfile } from "@/types";

function persistDemoPets(pets: Pet[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DEMO_PETS_STORAGE_KEY, JSON.stringify(pets));
  } catch {
    /* ignore quota */
  }
}

// ─── Auth Hook ────────────────────────────────────────────────────────────────

export function useAuth() {
  const { user, setUser, setPets, setActivePet, setUserDataLoaded } = useAppStore();
  const router = useRouter();

  const signOut = useCallback(async () => {
    setUser(null);
    setPets([]);
    setActivePet(null);
    setUserDataLoaded(true);

    if (!isSupabaseConfigured) {
      router.replace("/login");
      return;
    }

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }

    router.replace("/login");
  }, [router, setActivePet, setPets, setUser, setUserDataLoaded]);

  return { user, signOut, isConfigured: isSupabaseConfigured };
}

// ─── User + Pets Loader ───────────────────────────────────────────────────────

export function useLoadUserData() {
  const { setUser, setPets, setActivePet, activePet, setUserDataLoaded } = useAppStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isSupabaseConfigured) {
      try {
        const raw =
          typeof window !== "undefined"
            ? sessionStorage.getItem(DEMO_PETS_STORAGE_KEY)
            : null;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed) && parsed.length > 0) {
            const pets = parsed as Pet[];
            setPets(pets);
            setActivePet(pets[0]);
          }
        }
      } catch {
        /* ignore */
      }
      setUserDataLoaded(true);
      return;
    }

    const supabase = createClient();
    let mounted = true;

    function clearUserData() {
      setUser(null);
      setPets([]);
      setActivePet(null);
    }

    function redirectToLogin() {
      const redirectTarget = buildRedirectTarget(pathname || "/dashboard");
      router.replace(
        buildLoginPath(redirectTarget, {
          reason: "session_expired",
        })
      );
    }

    async function load() {
      try {
        // Get current auth user
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!authUser) {
          clearUserData();
          setUserDataLoaded(true);
          redirectToLogin();
          return;
        }

        const fallbackUser: UserProfile = {
          id: authUser.id,
          email: authUser.email || "",
          full_name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "Pet Parent",
          subscription_status: "free_trial",
          created_at: authUser.created_at,
        };

        try {
          // Get profile from profiles table
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", authUser.id)
            .single();

          if (profile) {
            const userProfile: UserProfile = {
              id: profile.id,
              email: authUser.email || "",
              full_name: profile.full_name || authUser.email?.split("@")[0] || "Pet Parent",
              avatar_url: profile.avatar_url,
              subscription_status: profile.subscription_status || "free_trial",
              trial_ends_at: profile.trial_ends_at,
              stripe_customer_id: profile.stripe_customer_id,
              created_at: profile.created_at,
            };
            setUser(userProfile);
          } else {
            // Profile doesn't exist yet — use auth user data
            setUser(fallbackUser);
          }

          // Load pets for this user
          const { data: pets } = await supabase
            .from("pets")
            .select("*")
            .eq("user_id", authUser.id)
            .order("created_at", { ascending: true });

          if (pets && pets.length > 0) {
            setPets(pets as Pet[]);
            // Set first pet as active if none selected
            if (!activePet) setActivePet(pets[0] as Pet);
          }
        } catch (err) {
          setUser(fallbackUser);
          console.error("Failed to load user profile data:", err);
        }
      } catch (err) {
        clearUserData();
        console.error("Failed to resolve auth session:", err);
        redirectToLogin();
      } finally {
        if (mounted) {
          setUserDataLoaded(true);
        }
      }
    }

    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return;
      }

      if (event === "SIGNED_OUT" || !session?.user) {
        clearUserData();
        setUserDataLoaded(true);
        redirectToLogin();
        return;
      }

      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED" ||
        event === "PASSWORD_RECOVERY"
      ) {
        void load();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ─── Pet CRUD ─────────────────────────────────────────────────────────────────

export function usePets() {
  const { pets, setPets, setActivePet } = useAppStore();

  const savePet = useCallback(async (pet: Pet): Promise<Pet> => {
    if (!isSupabaseConfigured) {
      // Demo mode: local state + sessionStorage
      const updated = [...pets.filter((p) => p.id !== pet.id), pet];
      setPets(updated);
      setActivePet(pet);
      persistDemoPets(updated);
      return pet;
    }

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const petWithUser = { ...pet, user_id: user.id }; // always bind to session user

      const { data, error } = await supabase
        .from("pets")
        .upsert(petWithUser, { onConflict: "id" })
        .select()
        .single();

      if (error) throw error;

      const saved = data as Pet;
      const updated = [...pets.filter((p) => p.id !== saved.id), saved];
      setPets(updated);
      setActivePet(saved);
      return saved;
    } catch (err) {
      console.error("Failed to save pet:", err);
      throw new Error("Could not save pet. Your changes were not saved.");
    }
  }, [pets, setPets, setActivePet]);

  const deletePet = useCallback(async (petId: string): Promise<void> => {
    if (!isSupabaseConfigured) {
      const updated = pets.filter((p) => p.id !== petId);
      setPets(updated);
      if (updated.length > 0) setActivePet(updated[0]);
      else setActivePet(null);
      persistDemoPets(updated);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.from("pets").delete().eq("id", petId);
      if (error) {
        throw error;
      }

      const updated = pets.filter((p) => p.id !== petId);
      setPets(updated);
      if (updated.length > 0) setActivePet(updated[0]);
      else setActivePet(null);
    } catch (err) {
      console.error("Failed to delete pet from DB:", err);
      throw new Error("Could not delete pet. Please try again.");
    }
  }, [pets, setPets, setActivePet]);

  return { pets, savePet, deletePet };
}

// ─── Triage History ───────────────────────────────────────────────────────────

export async function saveTriageSession(
  petId: string,
  symptoms: string,
  report: string,
  severity: "low" | "medium" | "high" | "emergency",
  recommendation: "monitor" | "vet_48h" | "vet_24h" | "emergency_vet"
): Promise<void> {
  if (!isSupabaseConfigured) return;

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("symptom_checks").insert({
      pet_id: petId,
      symptoms,
      ai_response: report,
      severity,
      recommendation,
    });
  } catch (err) {
    console.error("Failed to save triage session:", err);
    // Non-blocking — don't throw
  }
}
