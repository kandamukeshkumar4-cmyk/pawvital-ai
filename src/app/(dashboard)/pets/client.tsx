"use client";

import { useState, useMemo, useEffect } from "react";
import type { Pet, SymptomCheck } from "@/types";
import { ComparativeHealth, type PetHealthSummary } from "@/components/pets/comparative-health";
import PetProfileModal from "@/components/onboarding/pet-profile-modal";
import Button from "@/components/ui/button";
import { Plus, Activity, Clock, Dog, Cat, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

export function PetDashboardClient({ initialPets, initialChecks, isDemo }: { initialPets: Pet[], initialChecks: SymptomCheck[], isDemo: boolean }) {
  const [pets] = useState(initialPets);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();
  const [clientNowMs, setClientNowMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setClientNowMs(Date.now());
    queueMicrotask(tick);
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Calculate stats for comparative health
  const stats = useMemo<PetHealthSummary[]>(() => {
    if (clientNowMs == null) return [];
    return pets.map((pet) => {
      const petChecks = initialChecks.filter((c) => c.pet_id === pet.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      const lastCheck = petChecks[0];
      const prevCheck = petChecks[1];
      
      let trend: "up" | "down" | "stable" | null = null;
      if (lastCheck && prevCheck) {
        const severityScores: Record<string, number> = { emergency: 4, urgent: 4, high: 3, medium: 2, low: 1 };
        const scoreA = severityScores[lastCheck.severity] || 0;
        const scoreB = severityScores[prevCheck.severity] || 0;
        if (scoreA > scoreB) trend = "up"; // severity got worse
        else if (scoreA < scoreB) trend = "down"; // severity got better
        else trend = "stable";
      } else if (lastCheck) {
        trend = "stable";
      }

      const daysSinceLastCheck = lastCheck
        ? Math.floor(
            (clientNowMs - new Date(lastCheck.created_at).getTime()) / (1000 * 60 * 60 * 24)
          )
        : null;

      return {
        pet,
        lastSeverity: lastCheck ? lastCheck.severity : null,
        lastCheckDate: lastCheck ? lastCheck.created_at : null,
        daysSinceLastCheck,
        checkCount: petChecks.length,
        trend,
      };
    });
  }, [pets, initialChecks, clientNowMs]);

  if (clientNowMs == null && pets.length > 0) {
    return (
      <div className="max-w-6xl mx-auto p-8 flex justify-center text-slate-500 text-sm">
        Loading…
      </div>
    );
  }

  // If no pets, render empty state
  if (pets.length === 0) {
    return (
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-32 h-32 bg-indigo-50 text-indigo-400 rounded-full flex items-center justify-center mb-6">
          <Dog size={64} />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome to your Pet Dashboard</h1>
        <p className="text-slate-500 max-w-md mb-8">
          Add your furry friend to start tracking their health, receiving triage recommendations, and managing their wellness.
        </p>
        <Button onClick={() => setIsModalOpen(true)} size="lg" className="rounded-full px-8 gap-2">
          <Plus size={20} />
          Add your first pet
        </Button>
        <PetProfileModal open={isModalOpen} onSkipped={() => setIsModalOpen(false)} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {isDemo && (
        <div className="bg-amber-50 text-amber-800 p-3 rounded-lg border border-amber-200 text-sm text-center">
          <strong>Demo Mode:</strong> Displaying sample pets. Authentication is required to edit or create new pets.
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Pets Household</h1>
          <p className="text-slate-500 mt-1">Manage and track health for your furry family.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus size={18} />
          Add Pet
        </Button>
      </div>

      <ComparativeHealth stats={stats} />

      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Your Pets</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stats.map(({ pet, checkCount, daysSinceLastCheck, lastSeverity }) => (
            <div key={pet.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center">
                    {pet.species === "cat" ? <Cat size={24} /> : <Dog size={24} />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-slate-800">{pet.name}</h3>
                    <p className="text-sm text-slate-500">{pet.breed}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition px-2" onClick={() => setIsModalOpen(true)}>
                  <Settings size={16} className="text-slate-400" />
                  <span className="sr-only">Edit</span>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-medium">Age</p>
                  <p className="font-medium text-slate-700">{pet.age_years > 0 ? `${pet.age_years}y ` : ''}{pet.age_months}m</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-medium">Weight</p>
                  <p className="font-medium text-slate-700">{pet.weight} {pet.weight_unit}</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 flex items-center gap-2">
                    <Activity size={14} /> Total checks
                  </span>
                  <span className="font-medium text-slate-700">{checkCount}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 flex items-center gap-2">
                    <Clock size={14} /> Last check
                  </span>
                  <span className="font-medium text-slate-700">
                    {daysSinceLastCheck === null ? "Never" : daysSinceLastCheck === 0 ? "Today" : `${daysSinceLastCheck}d ago`}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Last severity</span>
                  <span className={`capitalize font-medium ${
                    lastSeverity === "emergency" || lastSeverity === "high" || lastSeverity === "urgent" ? "text-red-600" :
                    lastSeverity === "medium" ? "text-amber-600" :
                    lastSeverity === "low" ? "text-emerald-600" : "text-slate-400"
                  }`}>
                    {lastSeverity || "None"}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1 text-sm bg-indigo-600 hover:bg-slate-700 hover:text-white" onClick={() => router.push(`/symptom-checker?pet=${pet.id}`)}>
                  New Check
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-sm"
                  onClick={() => router.push(`/pets/${pet.id}`)}
                >
                  Health
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <PetProfileModal open={isModalOpen} onSkipped={() => setIsModalOpen(false)} />
    </div>
  );
}
