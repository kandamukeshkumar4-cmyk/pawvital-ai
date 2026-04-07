import {
  CheckCircle,
  Clock,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";

export const severityConfig = {
  low: {
    color: "success" as const,
    icon: CheckCircle,
    label: "Low Concern",
    bg: "bg-green-50 border-green-200",
  },
  medium: {
    color: "warning" as const,
    icon: Clock,
    label: "Moderate",
    bg: "bg-amber-50 border-amber-200",
  },
  high: {
    color: "danger" as const,
    icon: AlertTriangle,
    label: "High Concern",
    bg: "bg-orange-50 border-orange-200",
  },
  emergency: {
    color: "danger" as const,
    icon: AlertCircle,
    label: "Emergency",
    bg: "bg-red-50 border-red-200",
  },
};

export const likelihoodColors = {
  high: "bg-red-100 text-red-800 border-red-200",
  moderate: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
};

export const urgencyColors = {
  stat: "bg-red-100 text-red-800",
  urgent: "bg-orange-100 text-orange-800",
  routine: "bg-green-100 text-green-800",
};
