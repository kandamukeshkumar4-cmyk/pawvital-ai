"use client";

import { useState } from "react";
import {
  Activity,
  Stethoscope,
  Pill,
  Bell,
  TrendingUp,
  AlertCircle,
  Plus,
  Clock,
} from "lucide-react";
import Link from "next/link";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import HealthScoreCircle from "@/components/ui/health-score-circle";
import { useAppStore } from "@/store/app-store";

const quickActions = [
  {
    href: "/symptom-checker",
    icon: Stethoscope,
    label: "Check Symptoms",
    color: "bg-green-50 text-green-600 border-green-200",
  },
  {
    href: "/history",
    icon: Clock,
    label: "View History",
    color: "bg-sky-50 text-sky-600 border-sky-200",
  },
  {
    href: "/supplements",
    icon: Pill,
    label: "View Supplements",
    color: "bg-purple-50 text-purple-600 border-purple-200",
  },
  {
    href: "/reminders",
    icon: Bell,
    label: "Reminders",
    color: "bg-amber-50 text-amber-600 border-amber-200",
  },
  {
    href: "/journal",
    icon: Plus,
    label: "Add Journal Entry",
    color: "bg-pink-50 text-pink-600 border-pink-200",
  },
];

const recentActivity = [
  {
    type: "health_score",
    message: "Health score updated to 87",
    time: "2 hours ago",
    icon: Activity,
    color: "text-green-600",
  },
  {
    type: "reminder",
    message: "Joint supplement administered",
    time: "8 hours ago",
    icon: Pill,
    color: "text-purple-600",
  },
  {
    type: "symptom",
    message: "Symptom check: Slight limping - Monitor",
    time: "1 day ago",
    icon: Stethoscope,
    color: "text-blue-600",
  },
  {
    type: "journal",
    message: "Weight logged: 68 lbs",
    time: "2 days ago",
    icon: TrendingUp,
    color: "text-amber-600",
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

export default function DashboardPage() {
  const { activePet } = useAppStore();
  const [healthScore] = useState(87);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">
            {activePet ? `${activePet.name}'s Dashboard` : "Dashboard"}
          </h1>
          <p className="text-gray-500 mt-1">
            Here&apos;s how your dog is doing today
          </p>
        </div>
        <Link href="/symptom-checker" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Stethoscope className="w-4 h-4 mr-2" />
            Quick Symptom Check
          </Button>
        </Link>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Score */}
        <Card className="p-8 flex flex-col items-center justify-center">
          <h2 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wide">
            Daily Health Score
          </h2>
          <HealthScoreCircle score={healthScore} size="lg" />
          <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center sm:gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-900">92</div>
              <div className="text-xs text-gray-500">Activity</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">85</div>
              <div className="text-xs text-gray-500">Nutrition</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">78</div>
              <div className="text-xs text-gray-500">Mood</div>
            </div>
          </div>
        </Card>

        {/* Quick Actions */}
        <Card className="p-6">
          <h2 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wide">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div
                  className={`${action.color} border rounded-xl p-4 hover:shadow-sm transition-all cursor-pointer`}
                >
                  <action.icon className="w-6 h-6 mb-2" />
                  <span className="text-sm font-medium">{action.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Upcoming Reminders */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Upcoming Reminders
            </h2>
            <Link
              href="/reminders"
              className="text-xs text-blue-600 font-medium hover:text-blue-700"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {upcomingReminders.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
              >
                <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {r.title}
                  </p>
                  <p className="text-xs text-gray-500">{r.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-6">
        <h2 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wide">
          Recent Activity
        </h2>
        <div className="space-y-3">
          {recentActivity.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50 sm:gap-4"
            >
              <div
                className={`w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center ${item.color}`}
              >
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-900">{item.message}</p>
                <p className="text-xs text-gray-500">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Health Alert Banner */}
      <Card className="p-4 border-amber-200 bg-amber-50">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              Upcoming: Annual vaccination due in 2 weeks
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Schedule a vet appointment for {activePet?.name || "your dog"}
              &apos;s annual shots.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
