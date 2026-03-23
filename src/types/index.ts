export interface Pet {
  id: string;
  user_id: string;
  name: string;
  breed: string;
  species: "dog" | "cat";
  age_years: number;
  age_months: number;
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

export interface JournalEntry {
  id: string;
  pet_id: string;
  type: "note" | "milestone" | "health_event" | "photo" | "weight";
  title: string;
  content: string;
  photo_url?: string;
  weight?: number;
  mood?: "happy" | "normal" | "low" | "sick";
  date: string;
  created_at: string;
}

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
