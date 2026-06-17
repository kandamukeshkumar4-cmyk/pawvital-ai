"use client";

import { useState } from "react";
import {
  Activity,
  AlertCircle,
  Bell,
  ClipboardList,
  Plus,
  PawPrint,
  ShieldAlert,
  Stethoscope,
  Clock,
  Pill,
  TrendingUp,
} from "lucide-react";
import Card from "@/components/ui/card";
import { buttonClassName } from "@/components/ui/button";
import HealthScoreCircle from "@/components/ui/health-score-circle";
import { isPrivateTesterModeEnabled } from "@/lib/private-tester-access";
import { PRIVATE_TESTER_FOCUS_SUMMARY } from "@/lib/private-tester-scope";
import { useAppStore } from "@/store/app-store";

const quickActions = [
  {
    href: "/symptom-checker",
    icon: Stethoscope,
    label: "Check Symptoms",
    color: "bg-[#00c896]/10 text-[#00c896] border-[#00c896]/20",
  },
  {
    href: "/history",
    icon: Clock,
    label: "View History",
    color: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  },
  {
    href: "/supplements",
    icon: Pill,
    label: "View Supplements",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  {
    href: "/reminders",
    icon: Bell,
    label: "Reminders",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  {
    href: "/journal",
    icon: Plus,
    label: "Add Journal Entry",
    color: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  },
];

const recentActivity = [
  {
    type: "health_score",
    message: "Health score updated to 87",
    time: "2 hours ago",
    icon: Activity,
    color: "text-emerald-400",
  },
  {
    type: "reminder",
    message: "Joint supplement administered",
    time: "8 hours ago",
    icon: Pill,
    color: "text-purple-400",
  },
  {
    type: "symptom",
    message: "Symptom check: Slight limping - Monitor",
    time: "1 day ago",
    icon: Stethoscope,
    color: "text-blue-400",
  },
  {
    type: "journal",
    message: "Weight logged: 68 lbs",
    time: "2 days ago",
    icon: TrendingUp,
    color: "text-amber-400",
  },
];

const upcomingReminders = [
  {
    title: "Evening Joint Supplement",
    time: "6:00 PM today",
    type: "medication",
  },
  { title: "Flea & Tick Treatment", time: "Tomorrow", type: "flea_tick" },
  { title: "Annual Vet Checkup", time: "In 5 days", type: "vet_appointment" },
];

const privateTesterActions = [
  {
    description: "Run the dog symptom checker and review urgency guidance.",
    href: "/symptom-checker",
    icon: Stethoscope,
    label: "Start symptom check",
  },
  {
    description: "Open saved reports and share tester feedback from history.",
    href: "/history",
    icon: ClipboardList,
    label: "Review reports and feedback",
  },
  {
    description: "Add or update your dog profile for the private test.",
    href: "/pets",
    icon: PawPrint,
    label: "Update dog profile",
  },
];

function PrivateTesterDashboard({
  activePetName,
}: {
  activePetName: string | null;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">Private tester home</h1>
          <p className="mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
            {PRIVATE_TESTER_FOCUS_SUMMARY}
          </p>
        </div>
        <a
          href="/symptom-checker"
          target="_top"
          className={`${buttonClassName()} w-full sm:w-auto`}
        >
          <Stethoscope className="mr-2 h-4 w-4" />
          Open symptom checker
        </a>
      </div>

      <Card className="p-5" style={{ background: "rgba(251,191,36,0.08)", borderColor: "rgba(251,191,36,0.2)" }}>
        <div className="flex items-start gap-3">
          <div className="rounded-2xl p-3" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#fbbf24" }}>
              Not part of this private test
            </p>
            <p className="mt-2 text-sm leading-6" style={{ color: "rgba(251,191,36,0.8)" }}>
              Supplements, Paw Circle, analytics, reminders, and journal tools
              are hidden or disabled for private testers.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {privateTesterActions.map((action) => (
          <Card key={action.href} className="p-5">
            <action.icon className="h-6 w-6" style={{ color: "#00c896" }} />
            <h2 className="mt-4 text-lg font-semibold text-white">
              {action.label}
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "rgba(255,255,255,0.5)" }}>
              {action.description}
            </p>
            <a
              href={action.href}
              target="_top"
              className={`${buttonClassName({ variant: "outline", size: "sm" })} mt-4 inline-flex`}
            >
              {action.label}
            </a>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-semibold text-white">
          Keep the private test focused
        </h2>
        <p className="mt-2 text-sm leading-6" style={{ color: "rgba(255,255,255,0.5)" }}>
          Use the symptom checker for {activePetName || "your dog"}, open saved
          reports from History, and share feedback from the report view so we can
          improve the private test safely.
        </p>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const { activePet } = useAppStore();
  const [healthScore] = useState(87);

  if (isPrivateTesterModeEnabled()) {
    return <PrivateTesterDashboard activePetName={activePet?.name ?? null} />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">
            {activePet ? `${activePet.name}'s Dashboard` : "Dashboard"}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
            Here&apos;s how your dog is doing today
          </p>
        </div>
        <a
          href="/symptom-checker"
          target="_top"
          className={`${buttonClassName()} w-full sm:w-auto`}
        >
          <Stethoscope className="w-4 h-4 mr-2" />
          Quick Symptom Check
        </a>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Score */}
        <Card className="p-8 flex flex-col items-center justify-center">
          <h2
            className="text-xs font-medium mb-4 uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Daily Health Score
          </h2>
          <HealthScoreCircle score={healthScore} size="lg" />
          <div className="mt-6 grid w-full grid-cols-3 gap-2 text-center sm:gap-4">
            <div>
              <div className="text-lg font-bold text-white">92</div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Activity</div>
            </div>
            <div>
              <div className="text-lg font-bold text-white">85</div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Nutrition</div>
            </div>
            <div>
              <div className="text-lg font-bold text-white">78</div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Mood</div>
            </div>
          </div>
        </Card>

        {/* Quick Actions */}
        <Card className="p-6">
          <h2
            className="text-xs font-medium mb-4 uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {quickActions.map((action) => (
              <a key={action.href} href={action.href} target="_top">
                <div
                  className={`${action.color} border rounded-xl p-4 transition-all cursor-pointer`}
                  style={{ transition: "opacity 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                >
                  <action.icon className="w-5 h-5 mb-2" />
                  <span className="text-sm font-medium">{action.label}</span>
                </div>
              </a>
            ))}
          </div>
        </Card>

        {/* Upcoming Reminders */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-xs font-medium uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Upcoming Reminders
            </h2>
            <a
              href="/reminders"
              target="_top"
              className="text-xs font-medium"
              style={{ color: "#00c896" }}
            >
              View all
            </a>
          </div>
          <div className="space-y-3">
            {upcomingReminders.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#f59e0b" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {r.title}
                  </p>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{r.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-6">
        <h2
          className="text-xs font-medium mb-4 uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          Recent Activity
        </h2>
        <div className="space-y-1">
          {recentActivity.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl p-3 transition-colors sm:gap-4"
              style={{ transition: "background 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-white">{item.message}</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Health Alert Banner */}
      <Card
        className="p-4"
        style={{ background: "rgba(251,191,36,0.07)", borderColor: "rgba(251,191,36,0.18)" }}
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "#fbbf24" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "#fbbf24" }}>
              Upcoming: Annual vaccination due in 2 weeks
            </p>
            <p className="text-xs mt-1" style={{ color: "rgba(251,191,36,0.65)" }}>
              Schedule a vet appointment for {activePet?.name || "your dog"}
              &apos;s annual shots.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
