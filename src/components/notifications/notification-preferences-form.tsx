"use client";
import { useState, useEffect, useRef } from "react";
import { Loader2, Save, Bell, Mail, AlertTriangle, ClipboardList } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";

interface Prefs {
  email_digest: boolean;
  push_enabled: boolean;
  urgency_alerts: boolean;
  outcome_reminders: boolean;
  digest_frequency: "daily" | "weekly" | "never";
}

const DEFAULTS: Prefs = {
  email_digest: true,
  push_enabled: false,
  urgency_alerts: true,
  outcome_reminders: true,
  digest_frequency: "daily",
};

export function NotificationPreferencesForm() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    fetch("/api/notifications/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) setPrefs({ ...DEFAULTS, ...json.data });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!isSupabaseConfigured) return;
    setSaving(true);
    setSaveState("idle");
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });

      if (!res.ok) {
        throw new Error("Failed to persist notification preferences");
      }

      const json = await res.json().catch(() => null);
      if (json?.data) {
        setPrefs({ ...DEFAULTS, ...json.data });
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      setSaving(false);
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => setSaveState("idle"), 3000);
    }
  };

  const toggle = (
    key: keyof Pick<Prefs, "email_digest" | "push_enabled" | "urgency_alerts" | "outcome_reminders">
  ) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toggle rows */}
      {(
        [
          {
            key: "urgency_alerts" as const,
            icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
            label: "Urgency alerts",
            desc: "Immediate notification when your pet's symptoms indicate an emergency",
          },
          {
            key: "outcome_reminders" as const,
            icon: <ClipboardList className="w-4 h-4 text-amber-500" />,
            label: "Outcome reminders",
            desc: "Follow-up reminder to record what happened after a vet visit",
          },
          {
            key: "email_digest" as const,
            icon: <Mail className="w-4 h-4 text-blue-500" />,
            label: "Email digest",
            desc: "Receive a summary of your pet's health activity by email",
          },
          {
            key: "push_enabled" as const,
            icon: <Bell className="w-4 h-4 text-gray-500" />,
            label: "Push notifications",
            desc: "Browser push notifications (requires permission when enabled)",
          },
        ] as const
      ).map(({ key, icon, label, desc }) => (
        <div
          key={key}
          className="flex items-start justify-between gap-4 py-4 border-b border-gray-100 last:border-0"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0">
              {icon}
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs[key]}
            onClick={() => toggle(key)}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              prefs[key] ? "bg-blue-500" : "bg-gray-200"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                prefs[key] ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      ))}

      {/* Digest frequency — only shown when email_digest is on */}
      {prefs.email_digest && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Digest frequency</p>
            <p className="text-xs text-gray-500 mt-0.5">How often to send the email summary</p>
          </div>
          <select
            value={prefs.digest_frequency}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, digest_frequency: e.target.value as Prefs["digest_frequency"] }))
            }
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="never">Never</option>
          </select>
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !isSupabaseConfigured}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save preferences
        </button>

        {saveState === "saved" && (
          <span className="text-sm text-emerald-600 font-medium">Saved</span>
        )}
        {saveState === "error" && (
          <span className="text-sm text-red-500 font-medium">Failed to save — try again</span>
        )}
        {!isSupabaseConfigured && (
          <span className="text-xs text-gray-400">Connect Supabase to enable preferences</span>
        )}
      </div>
    </div>
  );
}
