-- Notifications inbox + preferences (run in Supabase SQL editor after core schema)

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT DEFAULT 'general',
  link_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  digest_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "notification_preferences_select_own"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notification_preferences_insert_own"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notification_preferences_update_own"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);
