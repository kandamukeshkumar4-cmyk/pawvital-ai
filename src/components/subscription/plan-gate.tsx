"use client";

import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase";
import { shouldBypassPlanGateForPrivateTester } from "@/lib/private-tester-access";
import { planMeetsRequired, useSubscriptionOptional } from "@/contexts/subscription-context";
import { useAppStore } from "@/store/app-store";

const UTM =
  "utm_source=app&utm_medium=plan_gate&utm_campaign=upgrade";

interface PlanGateProps {
  requiredPlan: "pro" | "clinic";
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function PlanGate({ requiredPlan, children, fallback }: PlanGateProps) {
  const sub = useSubscriptionOptional();
  const plan = sub?.plan ?? "free";
  const loading = sub?.loading ?? false;
  const user = useAppStore((state) => state.user);

  if (
    !isSupabaseConfigured ||
    shouldBypassPlanGateForPrivateTester(user?.email ?? null)
  ) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      fallback ?? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Checking your plan…
        </div>
      )
    );
  }

  if (planMeetsRequired(plan, requiredPlan)) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  const label = requiredPlan === "clinic" ? "Clinic" : "Pro";
  const href = `/pricing?${UTM}&required_plan=${requiredPlan}`;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-center">
      <p className="text-gray-900 font-semibold mb-1">Upgrade to {label}</p>
      <p className="text-sm text-gray-600 mb-4">
        This feature is included on the {label} plan.
      </p>
      <Link
        href={href}
        className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
      >
        View plans
      </Link>
    </div>
  );
}
