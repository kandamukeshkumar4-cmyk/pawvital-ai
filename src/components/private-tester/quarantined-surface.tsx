import Link from "next/link";
import {
  ClipboardList,
  PawPrint,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import { PRIVATE_TESTER_FOCUS_SUMMARY } from "@/lib/private-tester-scope";

interface PrivateTesterQuarantinedSurfaceProps {
  detail: string;
  featureLabel: string;
}

const fallbackActions = [
  {
    description: "Run the dog symptom checker and review urgency guidance.",
    href: "/symptom-checker",
    icon: Stethoscope,
    label: "Open symptom checker",
  },
  {
    description: "Review saved reports and open tester feedback from history.",
    href: "/history",
    icon: ClipboardList,
    label: "Open reports and feedback",
  },
  {
    description: "Add or update your dog profile during the private test.",
    href: "/pets",
    icon: PawPrint,
    label: "Open dog profile",
  },
];

export function PrivateTesterQuarantinedSurface({
  detail,
  featureLabel,
}: PrivateTesterQuarantinedSurfaceProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="border-amber-200 bg-amber-50 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-900">
              Not part of this private test
            </p>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {featureLabel} is disabled for private testers
              </h1>
              <p className="mt-2 text-sm leading-6 text-gray-700">{detail}</p>
            </div>
            <p className="text-sm leading-6 text-amber-900">
              {PRIVATE_TESTER_FOCUS_SUMMARY}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {fallbackActions.map((action) => (
          <Card key={action.href} className="p-5">
            <action.icon className="h-6 w-6 text-blue-600" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              {action.label}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {action.description}
            </p>
            <Link href={action.href} className="mt-4 inline-flex">
              <Button variant="outline" size="sm">
                {action.label}
              </Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
