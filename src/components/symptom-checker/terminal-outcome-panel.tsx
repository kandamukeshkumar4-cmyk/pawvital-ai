import {
  AlertTriangle,
  ArrowRight,
  CircleSlash,
  RotateCcw,
} from "lucide-react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";

export type TerminalOutcomeType = "cannot_assess" | "out_of_scope";

interface TerminalOutcomeMeta {
  badgeLabel: string;
  title: string;
  icon: typeof AlertTriangle;
  badgeVariant: "warning" | "default";
  badgeClassName: string;
  iconContainerClassName: string;
  nextStepClassName: string;
  footerText: string;
}

interface TerminalOutcomePanelProps {
  type: TerminalOutcomeType;
  reasonCode?: string | null;
  ownerMessage?: string | null;
  recommendedNextStep?: string | null;
  onStartNewSession: () => void;
}

interface TerminalOutcomeStatusBadgeProps {
  type: TerminalOutcomeType;
}

const TERMINAL_REASON_LABELS: Record<string, string> = {
  owner_cannot_assess_gum_color: "Could not confirm gum color",
  owner_cannot_assess_breathing_onset:
    "Could not confirm when the breathing problem started",
  owner_cannot_assess_consciousness_level: "Could not confirm responsiveness",
  species_not_supported: "Species not supported in this workflow",
  educational_hypothetical: "Hypothetical or educational scenario",
  medication_dosing_request: "Medication or dosing request",
  procedure_guidance_request: "Procedure or sedation guidance request",
  non_triage_topic: "Request outside symptom triage",
};

function humanizeReasonCode(reasonCode: string): string {
  return reasonCode
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getTerminalOutcomeMeta(type: TerminalOutcomeType): TerminalOutcomeMeta {
  if (type === "cannot_assess") {
    return {
      badgeLabel: "Cannot assess",
      title: "This symptom check ended because a critical sign could not be confirmed",
      icon: AlertTriangle,
      badgeVariant: "warning",
      badgeClassName: "bg-amber-100 text-amber-800",
      iconContainerClassName: "bg-amber-100 text-amber-700",
      nextStepClassName: "border-amber-200 bg-amber-50",
      footerText:
        "This intake has reached a safe stopping point. Please avoid guessing at home.",
    };
  }

  return {
    badgeLabel: "Out of scope",
    title: "This request is outside the current symptom-checker scope",
    icon: CircleSlash,
    badgeVariant: "default",
    badgeClassName: "bg-slate-100 text-slate-700",
    iconContainerClassName: "bg-slate-100 text-slate-600",
    nextStepClassName: "border-slate-200 bg-slate-50",
    footerText:
      "If you want to triage a different dog symptom, start a fresh session.",
  };
}

export function getTerminalOutcomeReasonLabel(reasonCode?: string | null): string {
  const normalized = String(reasonCode ?? "").trim();
  if (!normalized) {
    return "Safety stop reached";
  }

  if (TERMINAL_REASON_LABELS[normalized]) {
    return TERMINAL_REASON_LABELS[normalized];
  }

  if (normalized.startsWith("owner_cannot_assess_")) {
    return `Could not confirm ${humanizeReasonCode(
      normalized.replace("owner_cannot_assess_", "")
    ).toLowerCase()}`;
  }

  return humanizeReasonCode(normalized);
}

export function TerminalOutcomeStatusBadge({
  type,
}: TerminalOutcomeStatusBadgeProps) {
  const meta = getTerminalOutcomeMeta(type);
  const Icon = meta.icon;

  return (
    <Badge
      role="status"
      variant={meta.badgeVariant}
      className={`gap-1.5 px-3 py-1 text-[11px] font-semibold ${meta.badgeClassName}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{meta.badgeLabel}</span>
    </Badge>
  );
}

export function TerminalOutcomePanel({
  type,
  reasonCode,
  ownerMessage,
  recommendedNextStep,
  onStartNewSession,
}: TerminalOutcomePanelProps) {
  const meta = getTerminalOutcomeMeta(type);
  const Icon = meta.icon;
  const reasonLabel = getTerminalOutcomeReasonLabel(reasonCode);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="space-y-4 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${meta.iconContainerClassName}`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <TerminalOutcomeStatusBadge type={type} />
              <span className="text-xs font-medium text-gray-500">
                Terminal outcome
              </span>
            </div>
            <h3 className="mt-2 text-base font-semibold text-gray-900">
              {meta.title}
            </h3>
            {ownerMessage && (
              <p className="mt-1 text-sm leading-relaxed text-gray-600">
                {ownerMessage}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Reason
            </p>
            <p className="mt-2 text-sm font-medium text-gray-900">
              {reasonLabel}
            </p>
          </div>
          <div className={`rounded-xl border p-4 ${meta.nextStepClassName}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Recommended next step
            </p>
            <div className="mt-2 flex items-start gap-2 text-sm font-medium text-gray-900">
              <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>{recommendedNextStep || "Please contact your veterinarian directly."}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-gray-500">{meta.footerText}</p>
          <Button
            variant={type === "cannot_assess" ? "secondary" : "outline"}
            size="sm"
            onClick={onStartNewSession}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Start New Session
          </Button>
        </div>
      </div>
    </div>
  );
}
