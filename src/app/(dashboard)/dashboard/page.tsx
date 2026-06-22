"use client";

import {
  ClipboardList,
  PawPrint,
  ShieldAlert,
  Stethoscope,
  Upload,
} from "lucide-react";
import Card from "@/components/ui/card";
import { buttonClassName } from "@/components/ui/button";
import HealthBrief from "@/components/dog-brain/health-brief";
import { isPrivateTesterModeEnabled } from "@/lib/private-tester-access";
import { PRIVATE_TESTER_FOCUS_SUMMARY } from "@/lib/private-tester-scope";
import { useAppStore } from "@/store/app-store";

/** Display pet names with leading capitals so "bruno" reads as "Bruno". */
function titleCasePetName(name: string): string {
  return name.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

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
          <h1 className="text-2xl font-bold text-gray-900">Private tester home</h1>
          <p className="mt-1 text-gray-500">
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

      <Card className="p-5 bg-amber-50 border-amber-200">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl p-3 bg-amber-100 text-amber-700">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
              Not part of this private test
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-600">
              Supplements, Paw Circle, analytics, reminders, and journal tools
              are hidden or disabled for private testers.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {privateTesterActions.map((action) => (
          <Card key={action.href} className="p-5">
            <action.icon className="h-6 w-6 text-emerald-600" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              {action.label}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
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
        <h2 className="text-lg font-semibold text-gray-900">
          Keep the private test focused
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Use the symptom checker for {activePetName || "your dog"}, open saved
          reports from History, and share feedback from the report view so we can
          improve the private test safely.
        </p>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const { activePet, userDataLoaded } = useAppStore();

  if (isPrivateTesterModeEnabled()) {
    return <PrivateTesterDashboard activePetName={activePet?.name ?? null} />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1
            className="text-[30px] font-bold leading-tight text-[#1d1d1b]"
            style={{ letterSpacing: "-0.6px" }}
          >
            {activePet ? `${titleCasePetName(activePet.name)}'s Health Brief` : "Health Brief"}
          </h1>
          <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-[#6f7069]">
            PawVital remembers every log, photo, symptom check and vet record — so
            nothing about {activePet ? `${titleCasePetName(activePet.name)}` : "your dog"}&apos;s
            health slips through the cracks.
          </p>
        </div>
        <a
          href="/analytics"
          target="_top"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#ebeae5] bg-white px-4 py-2.5 text-sm font-medium text-[#3f4a45] transition-colors hover:bg-[#f7f9f8]"
        >
          <Upload className="h-4 w-4" />
          Share summary
        </a>
      </div>

      {/* Today's Health Brief — real Dog Brain signals from live endpoints */}
      <HealthBrief
        petId={activePet?.id ?? null}
        petName={activePet?.name ?? "your dog"}
        userDataLoaded={userDataLoaded}
      />
    </div>
  );
}
