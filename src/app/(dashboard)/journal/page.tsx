"use client";

import { useState } from "react";
import {
  BookOpen,
  Plus,
  Camera,
  Scale,
  Star,
  Activity,
  Calendar,
  Smile,
  Frown,
  Meh,
  ThermometerSun,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import Select from "@/components/ui/select";
import Modal from "@/components/ui/modal";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";

interface JournalItem {
  id: string;
  type: "note" | "milestone" | "health_event" | "photo" | "weight";
  title: string;
  content: string;
  mood?: "happy" | "normal" | "low" | "sick";
  weight?: number;
  date: string;
  timeAgo: string;
}

const moodIcons = {
  happy: { icon: Smile, color: "text-green-500", label: "Happy" },
  normal: { icon: Meh, color: "text-blue-500", label: "Normal" },
  low: { icon: Frown, color: "text-amber-500", label: "Low Energy" },
  sick: { icon: ThermometerSun, color: "text-red-500", label: "Sick" },
};

const typeIcons = {
  note: { icon: BookOpen, color: "bg-blue-50 text-blue-600" },
  milestone: { icon: Star, color: "bg-amber-50 text-amber-600" },
  health_event: { icon: Activity, color: "bg-red-50 text-red-600" },
  photo: { icon: Camera, color: "bg-pink-50 text-pink-600" },
  weight: { icon: Scale, color: "bg-green-50 text-green-600" },
};

const initialEntries: JournalItem[] = [
  {
    id: "1",
    type: "weight",
    title: "Weight Check",
    content: "Cooper weighed in at 68 lbs today. Down 2 lbs from last month - the new diet is working!",
    weight: 68,
    mood: "happy",
    date: "Mar 23, 2026",
    timeAgo: "Today",
  },
  {
    id: "2",
    type: "note",
    title: "Great Walk Today",
    content: "Cooper was full of energy on our walk today. He even tried to chase a squirrel! Haven't seen him this lively in months.",
    mood: "happy",
    date: "Mar 22, 2026",
    timeAgo: "Yesterday",
  },
  {
    id: "3",
    type: "health_event",
    title: "Slight Limping Noticed",
    content: "Cooper was limping slightly on his back left leg after our afternoon walk. Applied warm compress and he seemed better by evening.",
    mood: "low",
    date: "Mar 20, 2026",
    timeAgo: "3 days ago",
  },
  {
    id: "4",
    type: "milestone",
    title: "3 Months on Supplement Plan!",
    content: "It's been 3 months since starting the PawVital supplement plan. Cooper's mobility has improved significantly. The vet noticed too!",
    mood: "happy",
    date: "Mar 15, 2026",
    timeAgo: "1 week ago",
  },
  {
    id: "5",
    type: "note",
    title: "Vet Visit - All Clear",
    content: "Annual checkup went well. Dr. Smith said Cooper is in great shape for his age. Blood work all normal. She asked what we've been doing differently!",
    mood: "happy",
    date: "Mar 10, 2026",
    timeAgo: "2 weeks ago",
  },
  {
    id: "6",
    type: "weight",
    title: "Weight Check",
    content: "Monthly weigh-in: 70 lbs. Slightly above target. Adjusting portion sizes.",
    weight: 70,
    mood: "normal",
    date: "Feb 23, 2026",
    timeAgo: "1 month ago",
  },
];

export default function JournalPage() {
  const { activePet } = useAppStore();
  const [entries, setEntries] = useState(initialEntries);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [newEntry, setNewEntry] = useState({
    type: "note",
    title: "",
    content: "",
    mood: "normal",
    weight: "",
  });

  const addEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const entry: JournalItem = {
      id: crypto.randomUUID(),
      type: newEntry.type as JournalItem["type"],
      title: newEntry.title,
      content: newEntry.content,
      mood: newEntry.mood as JournalItem["mood"],
      weight: newEntry.weight ? parseFloat(newEntry.weight) : undefined,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      timeAgo: "Just now",
    };
    setEntries((prev) => [entry, ...prev]);
    setShowAddModal(false);
    setNewEntry({ type: "note", title: "", content: "", mood: "normal", weight: "" });
  };

  const filteredEntries = filter === "all" ? entries : entries.filter((e) => e.type === filter);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {activePet?.name || "Cooper"}&apos;s Journal
          </h1>
          <p className="text-gray-500 mt-1">Track milestones, health events, and daily life</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="w-4 h-4 mr-2" /> New Entry
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{entries.length}</p>
          <p className="text-xs text-gray-500">Total Entries</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">68 lbs</p>
          <p className="text-xs text-gray-500">Current Weight</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">12</p>
          <p className="text-xs text-gray-500">Happy Days (30d)</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">4</p>
          <p className="text-xs text-gray-500">Milestones</p>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: "all", label: "All" },
          { value: "note", label: "Notes" },
          { value: "milestone", label: "Milestones" },
          { value: "health_event", label: "Health" },
          { value: "weight", label: "Weight" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {filteredEntries.map((entry) => {
          const typeInfo = typeIcons[entry.type];
          const moodInfo = entry.mood ? moodIcons[entry.mood] : null;
          return (
            <Card key={entry.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl ${typeInfo.color} flex items-center justify-center flex-shrink-0`}>
                  <typeInfo.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{entry.title}</h3>
                    {moodInfo && (
                      <div className={`flex items-center gap-1 ${moodInfo.color}`}>
                        <moodInfo.icon className="w-4 h-4" />
                        <span className="text-xs">{moodInfo.label}</span>
                      </div>
                    )}
                    {entry.weight && (
                      <Badge variant="info">{entry.weight} lbs</Badge>
                    )}
                  </div>
                  <p className="text-gray-600 mt-2 leading-relaxed">{entry.content}</p>
                  <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
                    <Calendar className="w-3 h-3" />
                    <span>{entry.date}</span>
                    <span>·</span>
                    <span>{entry.timeAgo}</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Add Entry Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Journal Entry" size="lg">
        <form onSubmit={addEntry} className="space-y-4">
          <Select
            label="Entry Type"
            value={newEntry.type}
            onChange={(e) => setNewEntry({ ...newEntry, type: e.target.value })}
            options={[
              { value: "note", label: "Daily Note" },
              { value: "milestone", label: "Milestone" },
              { value: "health_event", label: "Health Event" },
              { value: "weight", label: "Weight Log" },
            ]}
          />
          <Input
            label="Title"
            value={newEntry.title}
            onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
            placeholder="What happened today?"
            required
          />
          <Textarea
            label="Details"
            value={newEntry.content}
            onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
            placeholder="Write about your pet's day..."
            rows={4}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mood</label>
              <div className="flex gap-2">
                {(Object.entries(moodIcons) as [string, { icon: typeof Smile; color: string; label: string }][]).map(
                  ([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNewEntry({ ...newEntry, mood: key })}
                      className={`p-2 rounded-xl border-2 transition-all ${
                        newEntry.mood === key
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
            {newEntry.type === "weight" && (
              <Input
                label="Weight (lbs)"
                type="number"
                value={newEntry.weight}
                onChange={(e) => setNewEntry({ ...newEntry, weight: e.target.value })}
                placeholder="68"
                step="0.1"
              />
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Entry</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
