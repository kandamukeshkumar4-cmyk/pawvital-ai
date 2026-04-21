"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  HeartPulse,
  ShieldAlert,
} from "lucide-react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";

interface TesterBoundaryCardProps {
  petName: string;
  onAcknowledge: () => void;
}

const CAN_DO_POINTS = [
  "Help you understand urgency.",
  "Help you prepare for a vet visit.",
  "Summarize what you are seeing so you can share it with a veterinarian.",
];

const CANNOT_DO_POINTS = [
  "Diagnose your dog.",
  "Replace a veterinarian.",
  "Prescribe treatment.",
  "Guarantee an outcome.",
];

const ACKNOWLEDGEMENT_POINTS = [
  "This is private testing.",
  "PawVital gives urgency guidance, not diagnosis.",
  "I should not rely on PawVital as my only source of help in a real emergency.",
  "My feedback may be reviewed to improve the product.",
  "I can request data deletion.",
];

export default function TesterBoundaryCard({
  petName,
  onAcknowledge,
}: TesterBoundaryCardProps) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Card className="overflow-hidden border-blue-200 shadow-lg shadow-blue-100/40">
      <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 via-white to-amber-50 px-5 py-5 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">Private tester preview</Badge>
          <Badge variant="warning">Dog-only</Badge>
        </div>
        <h2 className="mt-3 text-2xl font-bold text-gray-900">
          Before you use PawVital with {petName}
        </h2>
        <div className="mt-3 max-w-3xl space-y-3 text-sm leading-6 text-gray-700 sm:text-base">
          <p>
            PawVital helps you understand urgency and prepare for a vet visit.
          </p>
          <p>
            It does not diagnose your dog, replace a veterinarian, prescribe
            treatment, or guarantee an outcome.
          </p>
          <p>
            If your dog is struggling to breathe, collapsed, bleeding heavily,
            having repeated seizures, unable to urinate, or you think this is an
            emergency, contact a veterinarian immediately.
          </p>
        </div>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-8 sm:py-6">
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
            <div className="flex items-start gap-3">
              <HeartPulse className="mt-0.5 h-5 w-5 text-emerald-700" />
              <div>
                <h3 className="font-semibold text-emerald-950">
                  What PawVital can do
                </h3>
                <ul className="mt-2 space-y-2 text-sm text-emerald-900">
                  {CAN_DO_POINTS.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-slate-700" />
              <div>
                <h3 className="font-semibold text-slate-950">
                  What PawVital cannot do
                </h3>
                <ul className="mt-2 space-y-2 text-sm text-slate-800">
                  {CANNOT_DO_POINTS.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-700" />
            <div>
              <h3 className="font-semibold text-red-950">
                Emergency signs need immediate veterinary care
              </h3>
              <p className="mt-2 text-sm leading-6 text-red-900">
                If your dog is struggling to breathe, collapsed, bleeding
                heavily, having repeated seizures, unable to urinate, or you
                think this is an emergency, contact a veterinarian immediately.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="mt-0.5 h-5 w-5 text-blue-700" />
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-950">
                Please acknowledge before continuing
              </h3>
              <ul className="mt-2 space-y-2 text-sm text-gray-700">
                {ACKNOWLEDGEMENT_POINTS.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-3">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-blue-950">
                  I understand these boundaries and want to continue private
                  testing.
                </span>
              </label>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            You can request data deletion at any time during private testing.
          </p>
          <Button disabled={!confirmed} onClick={onAcknowledge}>
            Acknowledge and continue
          </Button>
        </div>
      </div>
    </Card>
  );
}
