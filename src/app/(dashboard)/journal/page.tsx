"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Camera,
  Calendar,
  Smile,
  Frown,
  Meh,
  ThermometerSun,
  Sparkles,
  Trash2,
  Loader2,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Textarea from "@/components/ui/textarea";
import Select from "@/components/ui/select";
import Modal from "@/components/ui/modal";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { JournalEntry, JournalMood, JournalSummary } from "@/types/journal";

const moodIcons: Record<
  JournalMood,
  { icon: typeof Smile; color: string; label: string }
> = {
  happy: { icon: Smile, color: "text-green-500", label: "Happy" },
  normal: { icon: Meh, color: "text-blue-500", label: "Normal" },
  low: { icon: Frown, color: "text-amber-500", label: "Low energy" },
  sick: { icon: ThermometerSun, color: "text-red-500", label: "Sick / off" },
};

function formatDisplayDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const day = 86400000;
  if (diff < 60000) return "Just now";
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  return `${Math.floor(diff / day)} days ago`;
}

function trendBadgeVariant(
  trend: string
): "success" | "warning" | "danger" | "info" | "default" {
  const t = trend.toLowerCase();
  if (t.includes("improv")) return "success";
  if (t.includes("declin")) return "danger";
  if (t.includes("stable")) return "info";
  if (t.includes("mix")) return "warning";
  return "default";
}

export default function JournalPage() {
  const { activePet, pets } = useAppStore();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState<JournalSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    pet_id: "",
    mood: "normal" as JournalMood,
    energy_level: 5,
    notes: "",
    photo_paths: [] as string[],
    uploading: false,
  });

  const petById = useMemo(() => {
    const m = new Map<string, string>();
    pets.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [pets]);

  const fetchEntries = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setLoadError(null);
      setEntries([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const q = activePet?.id ? `?pet_id=${encodeURIComponent(activePet.id)}` : "";
      const res = await fetch(`/api/journal${q}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503 && json.code === "DEMO_MODE") {
        setEntries([]);
        setLoadError("Connect Supabase to sync your journal.");
        return;
      }
      if (!res.ok) {
        setLoadError(json.error || "Could not load journal.");
        setEntries([]);
        return;
      }
      setEntries(Array.isArray(json.data) ? json.data : []);
    } catch {
      setLoadError("Network error loading journal.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [activePet?.id]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    if (showAddModal) {
      const defaultPet = activePet?.id || pets[0]?.id || "";
      setForm((f) => ({
        ...f,
        pet_id: defaultPet,
        mood: "normal",
        energy_level: 5,
        notes: "",
        photo_paths: [],
        uploading: false,
      }));
    }
  }, [showAddModal, activePet?.id, pets]);

  const happyDays30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    return entries.filter((e) => {
      if (e.mood !== "happy") return false;
      const t = new Date(e.entry_date).getTime();
      return !Number.isNaN(t) && t >= cutoff;
    }).length;
  }, [entries]);

  const entriesWithPhotos = useMemo(
    () => entries.filter((e) => (e.photo_urls?.length ?? 0) > 0).length,
    [entries]
  );

  const lastSevenForSummary = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      const da = new Date(a.entry_date).getTime();
      const db = new Date(b.entry_date).getTime();
      return db - da;
    });
    const pick = sorted.slice(0, 7);
    return pick.reverse();
  }, [entries]);

  const canSummarize = lastSevenForSummary.length === 7;

  const handleUploadClick = () => fileInputRef.current?.click();

  const onFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setForm((f) => ({ ...f, uploading: true }));
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/journal/upload", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setLoadError(json.error || "Photo upload failed.");
          break;
        }
        if (json.path) uploaded.push(json.path);
        if (uploaded.length >= 12) break;
      }
      setForm((f) => ({
        ...f,
        photo_paths: [...f.photo_paths, ...uploaded].slice(0, 12),
        uploading: false,
      }));
    } catch {
      setForm((f) => ({ ...f, uploading: false }));
      setLoadError("Photo upload failed.");
    }
    e.target.value = "";
  };

  const removePhotoPath = (path: string) => {
    setForm((f) => ({
      ...f,
      photo_paths: f.photo_paths.filter((p) => p !== path),
    }));
  };

  const submitEntry = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.pet_id) return;
    setSaving(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pet_id: form.pet_id,
          mood: form.mood,
          energy_level: form.energy_level,
          notes: form.notes.trim() || null,
          photo_urls: form.photo_paths,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json.error || "Could not save entry.");
        return;
      }
      if (json.data) {
        setEntries((prev) => [json.data as JournalEntry, ...prev]);
      }
      setShowAddModal(false);
      setWeeklySummary(null);
    } catch {
      setLoadError("Network error saving entry.");
    } finally {
      setSaving(false);
    }
  };

  const runWeeklySummary = async () => {
    if (!canSummarize) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const payload = {
        entries: lastSevenForSummary.map((e) => ({
          entry_date: e.entry_date,
          mood: e.mood,
          energy_level: e.energy_level,
          notes: e.notes,
        })),
      };
      const res = await fetch("/api/journal/summary", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSummaryError(json.error || "Summary request failed.");
        return;
      }
      setWeeklySummary(json as JournalSummary);
    } catch {
      setSummaryError("Network error.");
    } finally {
      setSummaryLoading(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this journal entry?")) return;
    try {
      const res = await fetch(`/api/journal/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setLoadError(json.error || "Delete failed.");
        return;
      }
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setWeeklySummary(null);
    } catch {
      setLoadError("Delete failed.");
    }
  };

  const displayPetName = activePet?.name || pets[0]?.name || "Your pet";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {displayPetName}&apos;s Journal
          </h1>
          <p className="text-gray-500 mt-1">
            Daily notes, mood, and photos — synced when Supabase is connected
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void runWeeklySummary()}
            disabled={!isSupabaseConfigured || !canSummarize || summaryLoading}
            loading={summaryLoading}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            AI Weekly Summary
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            disabled={!isSupabaseConfigured || pets.length === 0}
          >
            <Plus className="w-4 h-4 mr-2" /> New Entry
          </Button>
        </div>
      </div>

      {!isSupabaseConfigured && (
        <Card className="p-4 bg-amber-50 border-amber-100">
          <p className="text-sm text-amber-900">
            Demo mode: add Supabase env vars to save journal entries to the cloud.
          </p>
        </Card>
      )}

      {loadError && (
        <Card className="p-4 bg-red-50 border-red-100">
          <p className="text-sm text-red-800">{loadError}</p>
        </Card>
      )}

      {weeklySummary && (
        <Card className="p-6 border-blue-100 bg-gradient-to-br from-blue-50/80 to-white">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">Weekly AI summary</h2>
            <Badge variant={trendBadgeVariant(weeklySummary.trend)}>
              Trend: {weeklySummary.trend}
            </Badge>
          </div>
          <p className="text-gray-700 leading-relaxed">{weeklySummary.summary}</p>
          {weeklySummary.flags.length > 0 && (
            <ul className="mt-3 text-sm text-amber-900 list-disc pl-5 space-y-1">
              {weeklySummary.flags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-gray-600 border-t border-gray-100 pt-4">
            {weeklySummary.recommendation}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            AI output is informational only — not a diagnosis. Ask your veterinarian
            about any concerns.
          </p>
        </Card>
      )}

      {summaryError && (
        <p className="text-sm text-red-600">{summaryError}</p>
      )}

      {!canSummarize && isSupabaseConfigured && entries.length > 0 && (
        <p className="text-sm text-gray-500">
          Add at least seven journal entries to generate an AI weekly summary (uses your
          seven most recent days with entries).
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {loading ? "—" : entries.length}
          </p>
          <p className="text-xs text-gray-500">Total entries</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">
            {activePet?.weight != null
              ? `${activePet.weight} ${activePet.weight_unit}`
              : "—"}
          </p>
          <p className="text-xs text-gray-500">Active pet weight</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{happyDays30}</p>
          <p className="text-xs text-gray-500">Happy days (30d)</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{entriesWithPhotos}</p>
          <p className="text-xs text-gray-500">Entries with photos</p>
        </Card>
      </div>

      <div className="space-y-4">
        {loading && (
          <Card className="p-8 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </Card>
        )}
        {!loading && entries.length === 0 && isSupabaseConfigured && (
          <Card className="p-8 text-center text-gray-500">
            No journal entries yet. Create one to get started.
          </Card>
        )}
        {!loading &&
          entries.map((entry) => {
            const moodInfo = entry.mood ? moodIcons[entry.mood] : null;
            return (
              <Card
                key={entry.id}
                className="p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">
                          {petById.get(entry.pet_id) || "Pet"}
                        </h3>
                        {moodInfo && (
                          <div
                            className={`flex items-center gap-1 ${moodInfo.color}`}
                          >
                            <moodInfo.icon className="w-4 h-4" />
                            <span className="text-xs">{moodInfo.label}</span>
                          </div>
                        )}
                        {entry.energy_level != null && (
                          <Badge variant="info">Energy {entry.energy_level}/10</Badge>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteEntry(entry.id)}
                        className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        aria-label="Delete entry"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {entry.notes && (
                      <p className="text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">
                        {entry.notes}
                      </p>
                    )}
                    {entry.photo_urls?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.photo_urls.map((url, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={`${entry.id}-${i}`}
                            src={url}
                            alt=""
                            className="h-24 w-24 object-cover rounded-lg border border-gray-200"
                          />
                        ))}
                      </div>
                    )}
                    {entry.ai_summary && (
                      <p className="mt-3 text-sm text-blue-900 bg-blue-50/80 rounded-lg p-3">
                        {entry.ai_summary}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDisplayDate(entry.entry_date)}</span>
                      <span>·</span>
                      <span>{relativeTime(entry.created_at)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
      </div>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="New journal entry"
        size="lg"
      >
        <form onSubmit={(e) => void submitEntry(e)} className="space-y-4">
          <Select
            label="Pet"
            value={form.pet_id}
            onChange={(e) => setForm({ ...form, pet_id: e.target.value })}
            options={pets.map((p) => ({ value: p.id, label: p.name }))}
            required
            disabled={pets.length === 0}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Mood
            </label>
            <div className="flex gap-2 flex-wrap">
              {(Object.entries(moodIcons) as [JournalMood, (typeof moodIcons)["happy"]][]).map(
                ([key, info]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm({ ...form, mood: key })}
                    className={`p-2 rounded-xl border-2 transition-all ${
                      form.mood === key
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    title={info.label}
                  >
                    <info.icon className={`w-6 h-6 ${info.color}`} />
                  </button>
                )
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Energy: {form.energy_level}/10
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={form.energy_level}
              onChange={(e) =>
                setForm({ ...form, energy_level: Number(e.target.value) })
              }
              className="w-full accent-blue-600"
            />
          </div>
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="How is your pet doing today?"
            rows={4}
          />
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(e) => void onFilesSelected(e)}
            />
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Photos
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={handleUploadClick}
              disabled={form.uploading || form.photo_paths.length >= 12}
              loading={form.uploading}
            >
              <Camera className="w-4 h-4 mr-2" />
              Upload photos
            </Button>
            {form.photo_paths.length > 0 && (
              <ul className="mt-2 text-xs text-gray-500 space-y-1">
                {form.photo_paths.map((p) => (
                  <li
                    key={p}
                    className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2 py-1"
                  >
                    <span className="truncate">{p.split("/").pop()}</span>
                    <button
                      type="button"
                      className="text-red-600 shrink-0"
                      onClick={() => removePhotoPath(p)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!form.pet_id || saving} loading={saving}>
              Save entry
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
