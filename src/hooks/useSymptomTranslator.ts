"use client";

import { useRef } from "react";
import type { SymptomReport } from "@/components/symptom-report";
import {
  normalizeOwnerTextForClinical,
  translateAssistantTextForOwner,
  translateReportForOwner,
} from "@/lib/azure/translator-client";

export function useSymptomTranslator() {
  const ownerLanguageRef = useRef<string | null>(null);

  const normalizeOwnerMessage = async (text: string) => {
    const normalized = await normalizeOwnerTextForClinical(text);
    if (normalized.ownerLanguage) {
      ownerLanguageRef.current = normalized.ownerLanguage;
    }
    return normalized;
  };

  const localizeAssistantText = async (text: string) => {
    const localized = await translateAssistantTextForOwner(
      text,
      ownerLanguageRef.current,
    );
    return {
      apiContent: localized.translated ? localized.apiText : undefined,
      content: localized.displayText,
    };
  };

  const localizeReport = (report: SymptomReport) =>
    translateReportForOwner(report, ownerLanguageRef.current);

  const resetOwnerLanguage = () => {
    ownerLanguageRef.current = null;
  };

  return {
    localizeAssistantText,
    localizeReport,
    normalizeOwnerMessage,
    resetOwnerLanguage,
  };
}
