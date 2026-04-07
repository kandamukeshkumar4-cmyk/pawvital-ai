export type PetSpecies = "dog" | "cat" | "other";

export type PetAgeUnit = "weeks" | "months" | "years";

export interface Pet {
  id: string;
  user_id: string;
  name: string;
  breed: string;
  species: PetSpecies;
  /** Canonical age for storage and display (aligned with age_unit). */
  age_years: number;
  age_months: number;
  /** When set, age_years / age_months represent this unit (onboarding uses a single field). */
  age_unit?: PetAgeUnit;
  weight: number;
  weight_unit: "lbs" | "kg";
  gender: "male" | "female";
  is_neutered: boolean;
  existing_conditions: string[];
  medications: string[];
  photo_url?: string;
  created_at: string;
  updated_at: string;
}

/** Paid product tier from subscriptions table (live mode). */
export type SubscriptionPlanTier = "free" | "pro" | "clinic";

export interface SubscriptionRow {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  plan: SubscriptionPlanTier;
  status: string;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthScore {
  id: string;
  pet_id: string;
  score: number;
  factors: {
    activity: number;
    nutrition: number;
    weight: number;
    symptoms: number;
    mood: number;
  };
  date: string;
  created_at: string;
}

export interface SymptomCheck {
  id: string;
  pet_id: string;
  symptoms: string;
  ai_response: string;
  severity: "low" | "medium" | "high" | "emergency";
  recommendation: "monitor" | "vet_48h" | "emergency_vet";
  created_at: string;
}

export interface Supplement {
  id: string;
  pet_id: string;
  name: string;
  purpose: string;
  dosage: string;
  frequency: string;
  affiliate_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface Reminder {
  id: string;
  pet_id: string;
  user_id: string;
  title: string;
  type: "medication" | "vet_appointment" | "flea_tick" | "vaccination" | "custom";
  frequency: "daily" | "weekly" | "monthly" | "yearly" | "once";
  time: string;
  next_due: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
}

export type { JournalEntry, JournalEntryInput, JournalMood, JournalSummary } from "./journal";

export interface CommunityPost {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar?: string;
  title: string;
  content: string;
  category: "senior_care" | "nutrition" | "behavior" | "health" | "general";
  likes: number;
  comments_count: number;
  created_at: string;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  user_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  subscription_status: "free_trial" | "active" | "cancelled" | "expired";
  trial_ends_at?: string;
  stripe_customer_id?: string;
  created_at: string;
}
