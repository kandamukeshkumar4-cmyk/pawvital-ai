"use client";

import { useState } from "react";
import { Plus, Save, Trash2, Edit2 } from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import { useAppStore } from "@/store/app-store";
import { usePets } from "@/hooks/useSupabase";
import type { Pet } from "@/types";

const breedOptions = [
  { value: "", label: "Select breed..." },
  { value: "Golden Retriever", label: "Golden Retriever" },
  { value: "Labrador Retriever", label: "Labrador Retriever" },
  { value: "German Shepherd", label: "German Shepherd" },
  { value: "Beagle", label: "Beagle" },
  { value: "Bulldog", label: "Bulldog" },
  { value: "Poodle", label: "Poodle" },
  { value: "Rottweiler", label: "Rottweiler" },
  { value: "Dachshund", label: "Dachshund" },
  { value: "Boxer", label: "Boxer" },
  { value: "Husky", label: "Husky" },
  { value: "Mixed Breed", label: "Mixed Breed" },
  { value: "Other", label: "Other" },
];

export default function SettingsPage() {
  const { pets, setActivePet } = useAppStore();
  const { savePet, deletePet } = usePets();
  const [showAddPet, setShowAddPet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [petForm, setPetForm] = useState({
    name: "",
    breed: "",
    species: "dog" as "dog" | "cat",
    age_years: "",
    age_months: "",
    weight: "",
    weight_unit: "lbs" as "lbs" | "kg",
    gender: "male" as "male" | "female",
    is_neutered: true,
    existing_conditions: "",
    medications: "",
  });

  const handleAddPet = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const newPet: Pet = {
      id: crypto.randomUUID(),
      user_id: "demo",
      name: petForm.name,
      breed: petForm.breed,
      species: petForm.species,
      age_years: parseInt(petForm.age_years) || 0,
      age_months: parseInt(petForm.age_months) || 0,
      weight: parseFloat(petForm.weight) || 0,
      weight_unit: petForm.weight_unit,
      gender: petForm.gender,
      is_neutered: petForm.is_neutered,
      existing_conditions: petForm.existing_conditions.split(",").map((s) => s.trim()).filter(Boolean),
      medications: petForm.medications.split(",").map((s) => s.trim()).filter(Boolean),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await savePet(newPet);
    setSaving(false);
    setShowAddPet(false);
    setPetForm({
      name: "", breed: "", species: "dog", age_years: "", age_months: "",
      weight: "", weight_unit: "lbs", gender: "male", is_neutered: true,
      existing_conditions: "", medications: "",
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Manage your pets and account</p>
        </div>
      </div>

      {/* Pet Profiles */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900">Pet Profiles</h2>
          <Button size="sm" onClick={() => setShowAddPet(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Pet
          </Button>
        </div>

        {pets.length === 0 && !showAddPet && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🐾</div>
            <p className="text-gray-500 mb-4">No pets added yet</p>
            <Button onClick={() => setShowAddPet(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Your First Pet
            </Button>
          </div>
        )}

        {/* Existing Pets */}
        <div className="space-y-3">
          {pets.map((pet) => (
            <div key={pet.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-xl">
                  {pet.species === "dog" ? "🐕" : "🐈"}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{pet.name}</p>
                  <p className="text-sm text-gray-500">
                    {pet.breed} · {pet.age_years}y {pet.age_months}m · {pet.weight} {pet.weight_unit}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setActivePet(pet)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deletePet(pet.id)}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Add Pet Form */}
        {showAddPet && (
          <form onSubmit={handleAddPet} className="mt-6 border-t border-gray-200 pt-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Add New Pet</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Pet Name"
                value={petForm.name}
                onChange={(e) => setPetForm({ ...petForm, name: e.target.value })}
                placeholder="e.g., Cooper"
                required
              />
              <Select
                label="Species"
                value={petForm.species}
                onChange={(e) => setPetForm({ ...petForm, species: e.target.value as "dog" | "cat" })}
                options={[
                  { value: "dog", label: "Dog" },
                  { value: "cat", label: "Cat" },
                ]}
              />
              <Select
                label="Breed"
                value={petForm.breed}
                onChange={(e) => setPetForm({ ...petForm, breed: e.target.value })}
                options={breedOptions}
                required
              />
              <Select
                label="Gender"
                value={petForm.gender}
                onChange={(e) => setPetForm({ ...petForm, gender: e.target.value as "male" | "female" })}
                options={[
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                ]}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Age (Years)"
                  type="number"
                  value={petForm.age_years}
                  onChange={(e) => setPetForm({ ...petForm, age_years: e.target.value })}
                  placeholder="Years"
                  min="0"
                  required
                />
                <Input
                  label="Age (Months)"
                  type="number"
                  value={petForm.age_months}
                  onChange={(e) => setPetForm({ ...petForm, age_months: e.target.value })}
                  placeholder="Months"
                  min="0"
                  max="11"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    label="Weight"
                    type="number"
                    value={petForm.weight}
                    onChange={(e) => setPetForm({ ...petForm, weight: e.target.value })}
                    placeholder="Weight"
                    step="0.1"
                    required
                  />
                </div>
                <div className="w-24">
                  <Select
                    label="Unit"
                    value={petForm.weight_unit}
                    onChange={(e) => setPetForm({ ...petForm, weight_unit: e.target.value as "lbs" | "kg" })}
                    options={[
                      { value: "lbs", label: "lbs" },
                      { value: "kg", label: "kg" },
                    ]}
                  />
                </div>
              </div>
              <Input
                label="Existing Conditions"
                value={petForm.existing_conditions}
                onChange={(e) => setPetForm({ ...petForm, existing_conditions: e.target.value })}
                placeholder="e.g., arthritis, allergies (comma-separated)"
              />
              <Input
                label="Current Medications"
                value={petForm.medications}
                onChange={(e) => setPetForm({ ...petForm, medications: e.target.value })}
                placeholder="e.g., Rimadyl, Apoquel (comma-separated)"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={petForm.is_neutered}
                onChange={(e) => setPetForm({ ...petForm, is_neutered: e.target.checked })}
                className="rounded border-gray-300"
                id="neutered"
              />
              <label htmlFor="neutered" className="text-sm text-gray-700">
                Spayed/Neutered
              </label>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={saving}>
                <Save className="w-4 h-4 mr-2" /> {saving ? "Saving..." : "Save Pet"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAddPet(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Account Settings */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-6">Account</h2>
        <div className="space-y-4">
          <Input label="Full Name" placeholder="Your name" defaultValue="Sarah M." />
          <Input label="Email" type="email" placeholder="you@example.com" defaultValue="sarah@example.com" />
          <Button>Save Changes</Button>
        </div>
      </Card>

      {/* Subscription */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Subscription</h2>
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
            Active - Free Trial
          </span>
          <span className="text-sm text-gray-500">Trial ends in 5 days</span>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Your plan: <strong>PawVital Pro</strong> — $9.97/month after trial
        </p>
        <div className="flex gap-3">
          <Button variant="outline" size="sm">Manage Subscription</Button>
          <Button variant="ghost" size="sm" className="text-red-500">Cancel</Button>
        </div>
      </Card>
    </div>
  );
}
