"use client";

import { useState } from "react";
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
  Edit2,
} from "lucide-react";
import { PrivateTesterQuarantinedSurface } from "@/components/private-tester/quarantined-surface";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import Modal from "@/components/ui/modal";
import { getPrivateTesterQuarantinedSurface } from "@/lib/private-tester-scope";

interface ReminderItem {
  id: string;
  title: string;
  type: "medication" | "vet_appointment" | "flea_tick" | "vaccination" | "custom";
  frequency: string;
  time: string;
  nextDue: string;
  isActive: boolean;
  notes?: string;
  completedToday?: boolean;
}

const typeConfig = {
  medication: { icon: Pill, color: "text-purple-600", bg: "bg-purple-50" },
  vet_appointment: { icon: Calendar, color: "text-blue-600", bg: "bg-blue-50" },
  flea_tick: { icon: Bug, color: "text-amber-600", bg: "bg-amber-50" },
  vaccination: { icon: Syringe, color: "text-green-600", bg: "bg-green-50" },
  custom: { icon: Bell, color: "text-gray-600", bg: "bg-gray-50" },
};

const initialReminders: ReminderItem[] = [
  {
    id: "1",
    title: "Morning Joint Supplement",
    type: "medication",
    frequency: "Daily",
    time: "8:00 AM",
    nextDue: "Today, 8:00 AM",
    isActive: true,
    completedToday: true,
  },
  {
    id: "2",
    title: "Evening Joint Supplement",
    type: "medication",
    frequency: "Daily",
    time: "6:00 PM",
    nextDue: "Today, 6:00 PM",
    isActive: true,
    completedToday: false,
  },
  {
    id: "3",
    title: "Omega-3 Fish Oil",
    type: "medication",
    frequency: "Daily",
    time: "8:00 AM",
    nextDue: "Today, 8:00 AM",
    isActive: true,
    completedToday: true,
  },
  {
    id: "4",
    title: "Flea & Tick Treatment",
    type: "flea_tick",
    frequency: "Monthly",
    time: "9:00 AM",
    nextDue: "Tomorrow",
    isActive: true,
    completedToday: false,
  },
  {
    id: "5",
    title: "Annual Vet Checkup",
    type: "vet_appointment",
    frequency: "Yearly",
    time: "10:00 AM",
    nextDue: "In 5 days",
    isActive: true,
    notes: "Dr. Smith at Riverside Vet Clinic",
  },
  {
    id: "6",
    title: "Rabies Vaccination",
    type: "vaccination",
    frequency: "Yearly",
    time: "10:00 AM",
    nextDue: "In 2 weeks",
    isActive: true,
  },
  {
    id: "7",
    title: "Heartworm Prevention",
    type: "medication",
    frequency: "Monthly",
    time: "8:00 AM",
    nextDue: "In 12 days",
    isActive: true,
  },
];

function RemindersPageContent() {
  const [reminders, setReminders] = useState(initialReminders);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newReminder, setNewReminder] = useState({
    title: "",
    type: "medication",
    frequency: "daily",
    time: "08:00",
    notes: "",
  });

  const toggleComplete = (id: string) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, completedToday: !r.completedToday } : r))
    );
  };

  const deleteReminder = (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  const addReminder = (e: React.FormEvent) => {
    e.preventDefault();
    const reminder: ReminderItem = {
      id: crypto.randomUUID(),
      title: newReminder.title,
      type: newReminder.type as ReminderItem["type"],
      frequency: newReminder.frequency,
      time: newReminder.time,
      nextDue: "Tomorrow",
      isActive: true,
      notes: newReminder.notes || undefined,
    };
    setReminders((prev) => [...prev, reminder]);
    setShowAddModal(false);
    setNewReminder({ title: "", type: "medication", frequency: "daily", time: "08:00", notes: "" });
  };

  const todayReminders = reminders.filter((r) => r.nextDue.includes("Today"));
  const upcomingReminders = reminders.filter((r) => !r.nextDue.includes("Today"));
  const completedToday = todayReminders.filter((r) => r.completedToday).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reminders</h1>
          <p className="text-gray-500 mt-1">Never miss a medication or appointment</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Reminder
        </Button>
      </div>

      {/* Today's Progress */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Today&apos;s Tasks</h2>
          <span className="text-sm text-gray-500">
            {completedToday}/{todayReminders.length} completed
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${todayReminders.length > 0 ? (completedToday / todayReminders.length) * 100 : 0}%` }}
          />
        </div>
        <div className="space-y-3">
          {todayReminders.map((r) => {
            const config = typeConfig[r.type];
            return (
              <div
                key={r.id}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  r.completedToday ? "bg-green-50 border-green-200" : "bg-white border-gray-200"
                }`}
              >
                <button
                  onClick={() => toggleComplete(r.id)}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    r.completedToday
                      ? "bg-green-500 border-green-500"
                      : "border-gray-300 hover:border-blue-500"
                  }`}
                >
                  {r.completedToday && <Check className="w-4 h-4 text-white" />}
                </button>
                <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center`}>
                  <config.icon className={`w-5 h-5 ${config.color}`} />
                </div>
                <div className="flex-1">
                  <p className={`font-medium ${r.completedToday ? "text-gray-400 line-through" : "text-gray-900"}`}>
                    {r.title}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    <Clock className="w-3 h-3" />
                    {r.time} · {r.frequency}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Upcoming */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Upcoming</h2>
        <div className="space-y-3">
          {upcomingReminders.map((r) => {
            const config = typeConfig[r.type];
            return (
              <div key={r.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center`}>
                  <config.icon className={`w-5 h-5 ${config.color}`} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{r.title}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    <Clock className="w-3 h-3" />
                    {r.nextDue} · {r.frequency}
                  </div>
                  {r.notes && (
                    <p className="text-xs text-gray-400 mt-1">{r.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4 text-gray-400" />
                  </button>
                  <button
                    onClick={() => deleteReminder(r.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Add Reminder Modal */}
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
            onChange={(e) => setNewReminder({ ...newReminder, type: e.target.value })}
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
            onChange={(e) => setNewReminder({ ...newReminder, frequency: e.target.value })}
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
            <Button type="submit">Add Reminder</Button>
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
