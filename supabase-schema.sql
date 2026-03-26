-- PawVital AI Database Schema
-- Run this in your Supabase SQL Editor to set up all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  subscription_status TEXT DEFAULT 'free_trial' CHECK (subscription_status IN ('free_trial', 'active', 'cancelled', 'expired')),
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pets
CREATE TABLE pets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  breed TEXT NOT NULL,
  species TEXT DEFAULT 'dog' CHECK (species IN ('dog', 'cat')),
  age_years INTEGER DEFAULT 0,
  age_months INTEGER DEFAULT 0,
  weight DECIMAL(6,2),
  weight_unit TEXT DEFAULT 'lbs' CHECK (weight_unit IN ('lbs', 'kg')),
  gender TEXT CHECK (gender IN ('male', 'female')),
  is_neutered BOOLEAN DEFAULT true,
  existing_conditions TEXT[] DEFAULT '{}',
  medications TEXT[] DEFAULT '{}',
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Health scores
CREATE TABLE health_scores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  factors JSONB DEFAULT '{}',
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Symptom checks
CREATE TABLE symptom_checks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE NOT NULL,
  symptoms TEXT NOT NULL,
  ai_response TEXT,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'emergency')),
  recommendation TEXT CHECK (recommendation IN ('monitor', 'vet_48h', 'vet_24h', 'emergency_vet')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supplements
CREATE TABLE supplements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT,
  dosage TEXT,
  frequency TEXT,
  brand TEXT,
  affiliate_url TEXT,
  is_active BOOLEAN DEFAULT true,
  priority TEXT DEFAULT 'recommended' CHECK (priority IN ('essential', 'recommended', 'optional')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reminders
CREATE TABLE reminders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'custom' CHECK (type IN ('medication', 'vet_appointment', 'flea_tick', 'vaccination', 'custom')),
  frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly', 'once')),
  time TIME,
  next_due TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journal entries
CREATE TABLE journal_entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE NOT NULL,
  type TEXT DEFAULT 'note' CHECK (type IN ('note', 'milestone', 'health_event', 'photo', 'weight')),
  title TEXT NOT NULL,
  content TEXT,
  photo_url TEXT,
  weight DECIMAL(6,2),
  mood TEXT CHECK (mood IN ('happy', 'normal', 'low', 'sick')),
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Community posts
CREATE TABLE community_posts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('senior_care', 'nutrition', 'behavior', 'health', 'general')),
  likes INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Community comments
CREATE TABLE community_comments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptom_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/update their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Pets: users can CRUD their own pets
CREATE POLICY "Users can view own pets" ON pets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create pets" ON pets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pets" ON pets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pets" ON pets FOR DELETE USING (auth.uid() = user_id);

-- Health scores: users can access scores for their pets
CREATE POLICY "Users can view pet health scores" ON health_scores FOR SELECT
  USING (pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid()));
CREATE POLICY "Users can create health scores" ON health_scores FOR INSERT
  WITH CHECK (pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid()));

-- Symptom checks: users can access their own
CREATE POLICY "Users can view pet symptom checks" ON symptom_checks FOR SELECT
  USING (pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid()));
CREATE POLICY "Users can create symptom checks" ON symptom_checks FOR INSERT
  WITH CHECK (pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid()));

-- Supplements: users can CRUD for their pets
CREATE POLICY "Users can view pet supplements" ON supplements FOR SELECT
  USING (pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage supplements" ON supplements FOR ALL
  USING (pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid()));

-- Reminders: users can CRUD their own
CREATE POLICY "Users can manage reminders" ON reminders FOR ALL USING (auth.uid() = user_id);

-- Journal entries: users can CRUD for their pets
CREATE POLICY "Users can manage journal" ON journal_entries FOR ALL
  USING (pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid()));

-- Community: anyone authenticated can read, owners can modify
CREATE POLICY "Authenticated users can read posts" ON community_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create posts" ON community_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON community_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON community_posts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can read comments" ON community_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create comments" ON community_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON community_comments FOR DELETE USING (auth.uid() = user_id);

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-creating profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes for performance
CREATE INDEX idx_pets_user_id ON pets(user_id);
CREATE INDEX idx_health_scores_pet_id ON health_scores(pet_id);
CREATE INDEX idx_health_scores_date ON health_scores(date);
CREATE INDEX idx_symptom_checks_pet_id ON symptom_checks(pet_id);
CREATE INDEX idx_supplements_pet_id ON supplements(pet_id);
CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_next_due ON reminders(next_due);
CREATE INDEX idx_journal_entries_pet_id ON journal_entries(pet_id);
CREATE INDEX idx_journal_entries_date ON journal_entries(date);
CREATE INDEX idx_community_posts_category ON community_posts(category);
CREATE INDEX idx_community_posts_created ON community_posts(created_at DESC);
CREATE INDEX idx_community_comments_post ON community_comments(post_id);
