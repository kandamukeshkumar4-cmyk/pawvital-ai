"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Select from "@/components/ui/select";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import { useAppStore } from "@/store/app-store";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  DEFAULT_LOG_INPUT,
  SELECT_FIELDS,
  type HealthLog,
  type HealthLogInput,
} from "@/lib/health-log/types";
import { buildHealthLogReadout } from "@/lib/health-log/readout";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const TONE_TEXT: Record<"good" | "watch" | "alert", string> = {
  good: "#0a7d5b",
  watch: "#9a6b1f",
  alert: "#b23636",
};
const TONE_BG: Record<"good" | "watch" | "alert", string> = {
  good: "rgba(0,168,120,0.1)",
  watch: "rgba(224,164,88,0.16)",
  alert: "rgba(226,92,92,0.12)",
};

export default function HealthLogPage() {
  const { activePet, pets } = useAppStore();
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [form, setForm] = useState<HealthLogInput>({
    pet_id: activePet?.id ?? pets[0]?.id ?? "",
    log_date: todayIso(),
    ...DEFAULT_LOG_INPUT,
  });

  // Keep the selected pet in sync with the active pet once it loads.
  useEffect(() => {
    if (!form.pet_id && (activePet?.id || pets[0]?.id)) {
      setForm((f) => ({ ...f, pet_id: activePet?.id ?? pets[0]?.id ?? "" }));
    }
  }, [activePet?.id, pets, form.pet_id]);

  const fetchLogs = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const petId = activePet?.id;
      const q = petId ? `?pet_id=${encodeURIComponent(petId)}` : "";
      const res = await fetch(`/api/health-log${q}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not load your logs.");
        setLogs([]);
        return;
      }
      setLogs(Array.isArray(json.data) ? json.data : []);
    } catch {
      setError("Network error loading logs.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [activePet?.id]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const readout = useMemo(() => buildHealthLogReadout(logs), [logs]);

  const petOptions = useMemo(
    () => pets.map((p) => ({ value: p.id, label: p.name })),
    [pets],
  );

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.pet_id) return;
    if (!isSupabaseConfigured) {
      setError("Sign in with a saved profile to store daily logs.");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch("/api/health-log", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          notes: form.notes?.trim() || null,
          weight_kg: form.weight_kg || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          json.code === "TABLE_MISSING"
            ? "Daily logs aren't switched on for this account yet."
            : json.error || "Could not save your log.",
        );
        return;
      }
      const saved = json.data as HealthLog;
      setLogs((prev) => {
        const withoutSameDay = prev.filter((l) => l.id !== saved.id);
        return [saved, ...withoutSameDay];
      });
      setSavedAt(saved.log_date);
    } catch {
      setError("Network error saving your log.");
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof HealthLogInput>(
    key: K,
    value: HealthLogInput[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="mb-1 flex items-center gap-2 text-[#00a878]">
          <ClipboardList className="h-5 w-5" aria-hidden />
          <span className="text-sm font-semibold uppercase tracking-wide">
            Daily check-in
          </span>
        </div>
        <h1 className="text-2xl font-bold text-[#2c2a26]">
          How is {activePet?.name ?? "your dog"} doing today?
        </h1>
        <p className="mt-1 text-sm text-[#6b665d]">
          A quick 30-second log. Over time this shows what&apos;s getting better or
          worse — and makes a clean record to share with your vet.
        </p>
      </div>

      {!isSupabaseConfigured ? (
        <Card className="p-4 text-sm" style={{ background: "rgba(224,164,88,0.12)", borderColor: "rgba(224,164,88,0.4)" }}>
          <p className="text-[#8a4f15]">
            You&apos;re viewing demo mode. Sign in with a saved profile to store daily
            logs and build a history.
          </p>
        </Card>
      ) : null}

      {/* Readout — what the logs show so far */}
      {readout.hasToday ? (
        <section className="rounded-2xl border border-[#e8e2d8] bg-white p-5">
          <h2 className="text-base font-semibold text-[#2c2a26]">{readout.headline}</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#6b665d]">{readout.detail}</p>
          {readout.offSigns.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {readout.offSigns.map((s) => (
                <span
                  key={s.field}
                  className="rounded-full border px-3 py-1.5 text-sm font-medium"
                  style={{
                    background: TONE_BG[s.tone],
                    borderColor: TONE_TEXT[s.tone] + "55",
                    color: TONE_TEXT[s.tone],
                  }}
                >
                  {s.label}: {s.valueLabel}
                </span>
              ))}
            </div>
          ) : null}
          {readout.changes.length > 0 ? (
            <div className="mt-4 border-t border-[#e8e2d8] pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
                Since your last log
              </p>
              <ul className="mt-2 space-y-1.5">
                {readout.changes.map((c) => (
                  <li key={c.field} className="flex items-start gap-2 text-sm text-[#4a463f]">
                    <span
                      className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background:
                          c.direction === "improved"
                            ? "#00a878"
                            : c.direction === "worse"
                              ? "#d98b3a"
                              : "#a8a097",
                      }}
                      aria-hidden
                    />
                    {c.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Log form */}
      <form onSubmit={(e) => void submit(e)}>
        <Card className="space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {pets.length > 1 ? (
              <Select
                label="Dog"
                value={form.pet_id}
                onChange={(e) => setField("pet_id", e.target.value)}
                options={petOptions}
                required
              />
            ) : null}
            <Input
              label="Date"
              type="date"
              value={form.log_date ?? todayIso()}
              max={todayIso()}
              onChange={(e) => setField("log_date", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {SELECT_FIELDS.map((field) => (
              <Select
                key={field.key}
                label={field.label}
                value={form[field.key]}
                onChange={(e) =>
                  setField(
                    field.key,
                    e.target.value as HealthLogInput[typeof field.key],
                  )
                }
                options={field.options.map((o) => ({ value: o.value, label: o.label }))}
              />
            ))}
            <Input
              label="Vomiting (times today)"
              type="number"
              min={0}
              max={100}
              value={String(form.vomiting_count)}
              onChange={(e) =>
                setField("vomiting_count", Math.max(0, Number(e.target.value) || 0))
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Weight (kg, optional)"
              type="number"
              min={0}
              step="0.1"
              value={form.weight_kg != null ? String(form.weight_kg) : ""}
              onChange={(e) =>
                setField("weight_kg", e.target.value ? Number(e.target.value) : null)
              }
            />
            <label className="flex items-end gap-2 pb-2.5 text-sm text-[#4a463f]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={form.meds_given}
                onChange={(e) => setField("meds_given", e.target.checked)}
              />
              Gave medication / fluids today
            </label>
          </div>

          <Textarea
            label="Notes (optional)"
            value={form.notes ?? ""}
            onChange={(e) => setField("notes", e.target.value)}
            placeholder="Anything else you noticed today?"
            rows={3}
          />

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {savedAt ? (
            <p className="flex items-center gap-1.5 text-sm text-[#0a7d5b]">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Saved your check-in for {savedAt}.
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!form.pet_id || saving}
              loading={saving}
              className="w-full sm:w-auto"
            >
              Save today&apos;s check-in
            </Button>
          </div>
        </Card>
      </form>

      {/* Recent logs */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[#6b665d]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading your check-ins…
        </div>
      ) : logs.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a857a]">
            Recent check-ins
          </p>
          <div className="space-y-2">
            {logs.slice(0, 7).map((log) => {
              const off = buildHealthLogReadout([log]).offSigns;
              return (
                <Card key={log.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#2c2a26]">{log.log_date}</p>
                    <p className="truncate text-xs text-[#8a857a]">
                      {off.length === 0
                        ? "All normal"
                        : off.map((s) => `${s.label}: ${s.valueLabel}`).join(" · ")}
                    </p>
                  </div>
                  {log.meds_given ? (
                    <span className="shrink-0 rounded-full bg-[#f7f4ef] px-2.5 py-1 text-xs text-[#6b665d]">
                      Meds ✓
                    </span>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <p className="px-2 pb-4 pt-1 text-center text-xs leading-relaxed text-[#8a857a]">
        Daily logs help you and your vet spot changes — they&apos;re not a diagnosis.
        If you&apos;re worried or things get worse, contact your vet.
      </p>
    </div>
  );
}
