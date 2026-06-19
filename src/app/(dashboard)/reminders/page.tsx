"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Plus,
  Pill,
  Calendar,
  Bug,
  Syringe,
  Clock,
  Check,
  Trash2,
} from "lucide-react";
import { PrivateTesterQuarantinedSurface } from "@/components/private-tester/quarantined-surface";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import Modal from "@/components/ui/modal";
import { getPrivateTesterQuarantinedSurface } from "@/lib/private-tester-scope";
import { useAppStore } from "@/store/app-store";

type ReminderType = "medication" | "vet_appointment" | "flea_tick" | "vaccination" | "custom";
type Frequency = "daily" | "weekly" | "monthly" | "yearly" | "once";

interface ReminderRow {
  id: string;
  title: string;
  type: ReminderType;
  frequency: Frequency;
  time: string | null;
  next_due: string | null;
  is_active: boolean;
  notes: string | null;
}

const typeConfig: Record<ReminderType, { icon: typeof Pill; color: string; bg: string }> = {
  medication: { icon: Pill, color: "text-[#7c4dc4]", bg: "bg-purple-50" },
  vet_appointment: { icon: Calendar, color: "text-[#4f7fb8]", bg: "bg-blue-50" },
  flea_tick: { icon: Bug, color: "text-[#c1852a]", bg: "bg-amber-50" },
  vaccination: { icon: Syringe, color: "text-[#15795a]", bg: "bg-[#e7f4ee]" },
  custom: { icon: Bell, color: "text-gray-600", bg: "bg-gray-50" },
};

const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  once: "One time",
};

/** Roll a clock time forward by one frequency interval. */
function advanceDue(currentIso: string | null, frequency: Frequency): string | null {
  if (frequency === "once") return null;
  const base = currentIso ? new Date(currentIso) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const d = new Date(base);
  switch (frequency) {
    case "daily": d.setDate(d.getDate() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString();
}

/** Next occurrence ISO for a clock time, advanced if it already passed today. */
function computeNextDue(time: string, frequency: Frequency): string | null {
  const [h, m] = (time || "08:00").split(":").map((n) => Number(n) || 0);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now()) return advanceDue(d.toISOString(), frequency);
  return d.toISOString();
}

function dueLabel(nextDue: string | null): string {
  if (!nextDue) return "Scheduled";
  const due = new Date(nextDue);
  if (Number.isNaN(due.getTime())) return "Scheduled";
  const now = new Date();
  const timeStr = due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (due.toDateString() === now.toDateString()) return `Today, ${timeStr}`;
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  if (days === 1) return "Tomorrow";
  if (days > 1 && days <= 14) return `In ${days} days`;
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function RemindersPageContent() {
  const { activePet, userDataLoaded } = useAppStore();
  const petId = activePet?.id ?? null;

  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newReminder, setNewReminder] = useState({
    title: "",
    type: "medication" as ReminderType,
    frequency: "daily" as Frequency,
    time: "08:00",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!petId) {
      setReminders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/reminders?pet_id=${petId}&limit=100`);
      const json = (await res.json().catch(() => null)) as { data?: ReminderRow[] } | null;
      setReminders(Array.isArray(json?.data) ? json!.data : []);
    } catch {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }, [petId]);

  useEffect(() => {
    if (userDataLoaded) load();
  }, [userDataLoaded, load]);

  async function addReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!petId) return;
    setSaving(true);
    try {
      await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pet_id: petId,
          title: newReminder.title,
          type: newReminder.type,
          frequency: newReminder.frequency,
          time: newReminder.time || null,
          next_due: computeNextDue(newReminder.time, newReminder.frequency),
          notes: newReminder.notes || null,
        }),
      });
      setShowAddModal(false);
      setNewReminder({ title: "", type: "medication", frequency: "daily", time: "08:00", notes: "" });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function completeReminder(r: ReminderRow) {
    setBusyId(r.id);
    try {
      const body =
        r.frequency === "once"
          ? { is_active: false }
          : { next_due: advanceDue(r.next_due, r.frequency) };
      await fetch(`/api/reminders/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteReminder(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/reminders/${id}`, { method: "DELETE" });
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  const todayReminders = reminders.filter((r) => dueLabel(r.next_due).startsWith("Today"));
  const upcomingReminders = reminders.filter((r) => !dueLabel(r.next_due).startsWith("Today"));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1c2522]">Reminders</h1>
          <p className="text-[#8a978f] mt-1">
            {activePet ? `Never miss a med or appointment for ${activePet.name}` : "Never miss a med or appointment"}
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} disabled={!petId}>
          <Plus className="w-4 h-4 mr-2" /> Add Reminder
        </Button>
      </div>

      {!petId ? (
        <Card className="p-8 text-center">
          <Bell className="mx-auto h-8 w-8 text-[#b9c6bf]" />
          <p className="mt-3 text-sm text-[#8a978f]">Add a dog profile to start tracking reminders.</p>
        </Card>
      ) : loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-[#eef1ef] bg-[#f6f8f7]" aria-hidden />
      ) : reminders.length === 0 ? (
        <Card className="p-8 text-center">
          <Bell className="mx-auto h-8 w-8 text-[#b9c6bf]" />
          <p className="mt-3 text-sm text-[#8a978f]">
            No reminders yet. Add medication, vaccine, or vet-appointment reminders and they&apos;ll show on your dashboard.
          </p>
          <Button onClick={() => setShowAddModal(true)} className="mt-4">
            <Plus className="w-4 h-4 mr-2" /> Add your first reminder
          </Button>
        </Card>
      ) : (
        <>
          {todayReminders.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-[#1c2522] mb-4">Today&apos;s Tasks</h2>
              <div className="space-y-3">
                {todayReminders.map((r) => {
                  const config = typeConfig[r.type];
                  return (
                    <div key={r.id} className="flex items-center gap-4 p-4 rounded-xl border border-[#eef1ef] bg-white">
                      <button
                        onClick={() => completeReminder(r)}
                        disabled={busyId === r.id}
                        aria-label="Mark done"
                        className="w-6 h-6 rounded-full border-2 border-gray-300 hover:border-[#1f9d6b] flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-4 h-4 text-transparent" />
                      </button>
                      <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center`}>
                        <config.icon className={`w-5 h-5 ${config.color}`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-[#1c2522]">{r.title}</p>
                        <div className="flex items-center gap-2 text-xs text-[#8a978f] mt-1">
                          <Clock className="w-3 h-3" />
                          {dueLabel(r.next_due)} · {FREQUENCY_LABEL[r.frequency]}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteReminder(r.id)}
                        disabled={busyId === r.id}
                        aria-label="Delete reminder"
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {upcomingReminders.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-[#1c2522] mb-4">Upcoming</h2>
              <div className="space-y-3">
                {upcomingReminders.map((r) => {
                  const config = typeConfig[r.type];
                  return (
                    <div key={r.id} className="flex items-center gap-4 p-4 bg-[#fbfcfb] rounded-xl border border-[#eef1ef]">
                      <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center`}>
                        <config.icon className={`w-5 h-5 ${config.color}`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-[#1c2522]">{r.title}</p>
                        <div className="flex items-center gap-2 text-xs text-[#8a978f] mt-1">
                          <Clock className="w-3 h-3" />
                          {dueLabel(r.next_due)} · {FREQUENCY_LABEL[r.frequency]}
                        </div>
                        {r.notes && <p className="text-xs text-[#a8b0ab] mt-1">{r.notes}</p>}
                      </div>
                      <button
                        onClick={() => deleteReminder(r.id)}
                        disabled={busyId === r.id}
                        aria-label="Delete reminder"
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Reminder">
        <form onSubmit={addReminder} className="space-y-4">
          <Input
            label="Reminder Title"
            value={newReminder.title}
            onChange={(e) => setNewReminder({ ...newReminder, title: e.target.value })}
            placeholder="e.g., Morning joint supplement"
            required
          />
          <Select
            label="Type"
            value={newReminder.type}
            onChange={(e) => setNewReminder({ ...newReminder, type: e.target.value as ReminderType })}
            options={[
              { value: "medication", label: "Medication" },
              { value: "vet_appointment", label: "Vet Appointment" },
              { value: "flea_tick", label: "Flea & Tick" },
              { value: "vaccination", label: "Vaccination" },
              { value: "custom", label: "Custom" },
            ]}
          />
          <Select
            label="Frequency"
            value={newReminder.frequency}
            onChange={(e) => setNewReminder({ ...newReminder, frequency: e.target.value as Frequency })}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: "Yearly" },
              { value: "once", label: "One Time" },
            ]}
          />
          <Input
            label="Time"
            type="time"
            value={newReminder.time}
            onChange={(e) => setNewReminder({ ...newReminder, time: e.target.value })}
          />
          <Input
            label="Notes (optional)"
            value={newReminder.notes}
            onChange={(e) => setNewReminder({ ...newReminder, notes: e.target.value })}
            placeholder="Any additional notes..."
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add Reminder
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function RemindersPage() {
  const quarantinedSurface = getPrivateTesterQuarantinedSurface("/reminders");

  if (quarantinedSurface) {
    return <PrivateTesterQuarantinedSurface {...quarantinedSurface} />;
  }

  return <RemindersPageContent />;
}
