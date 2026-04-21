import { isPrivateTesterModeEnabled } from "./private-tester-access";

type EnvLike = Record<string, string | undefined>;

export interface PrivateTesterScopedNavItem {
  href: string;
}

export interface PrivateTesterQuarantinedSurface {
  detail: string;
  featureLabel: string;
}

export const PRIVATE_TESTER_FOCUS_SUMMARY =
  "This private test is focused on dog symptom triage, urgency guidance, vet handoff reports, feedback, and onboarding.";

const QUARANTINED_SURFACES: Record<string, PrivateTesterQuarantinedSurface> = {
  "/analytics": {
    detail: "Analytics dashboards are not part of this private test.",
    featureLabel: "Health analytics",
  },
  "/community": {
    detail: "Community features are not part of this private test.",
    featureLabel: "Paw Circle",
  },
  "/journal": {
    detail: "Journal tools are not part of this private test.",
    featureLabel: "Journal",
  },
  "/reminders": {
    detail: "Reminder tools are not part of this private test.",
    featureLabel: "Reminder tools",
  },
  "/supplements": {
    detail: "Supplement plans are not part of this private test.",
    featureLabel: "Supplement plan",
  },
};

export function getPrivateTesterQuarantinedSurface(
  pathname: string | null | undefined,
  env: EnvLike = process.env
): PrivateTesterQuarantinedSurface | null {
  if (!isPrivateTesterModeEnabled(env) || typeof pathname !== "string") {
    return null;
  }

  return QUARANTINED_SURFACES[pathname] ?? null;
}

export function filterPrivateTesterNavItems<T extends PrivateTesterScopedNavItem>(
  items: readonly T[],
  env: EnvLike = process.env
) {
  if (!isPrivateTesterModeEnabled(env)) {
    return [...items];
  }

  return items.filter(
    (item) => getPrivateTesterQuarantinedSurface(item.href, env) === null
  );
}
