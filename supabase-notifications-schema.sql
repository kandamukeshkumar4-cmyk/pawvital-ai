-- PawVital Notifications Schema
-- Apply with: node scripts/apply-notifications-schema.mjs

-- ── Notification types ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL CHECK (type IN (
                             'report_ready',
                             'urgency_alert',
                             'outcome_reminder',
                             'subscription',
                             'system'
                           )),
  title        TEXT        NOT NULL,
  body         TEXT,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  read         BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, read, created_at DESC);

-- ── User preferences ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id           UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_digest      BOOLEAN NOT NULL DEFAULT true,
  push_enabled      BOOLEAN NOT NULL DEFAULT false,
  urgency_alerts    BOOLEAN NOT NULL DEFAULT true,
  outcome_reminders BOOLEAN NOT NULL DEFAULT true,
  digest_frequency  TEXT    NOT NULL DEFAULT 'daily'
                    CHECK (digest_frequency IN ('daily', 'weekly', 'never'))
);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read and delete their own notifications
CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Users can update read flag on their own notifications
CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- System (service role) can insert notifications for any user
CREATE POLICY "System inserts notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Users can read and update their own preferences
CREATE POLICY "Users read own preferences"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users upsert own preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own preferences"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
