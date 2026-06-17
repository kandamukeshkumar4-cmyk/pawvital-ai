const QUICK_START_SYMPTOM_OPTIONS = [
  { label: "Not eating", symptom: "not_eating" },
  { label: "Limping", symptom: "limping" },
  { label: "Vomiting", symptom: "vomiting" },
  { label: "Diarrhea", symptom: "diarrhea" },
  { label: "Lethargy", symptom: "lethargy" },
  { label: "Excessive scratching", symptom: "excessive_scratching" },
  { label: "Coughing", symptom: "coughing" },
  { label: "Difficulty breathing", symptom: "difficulty_breathing" },
  { label: "Trembling/shaking", symptom: "trembling" },
  { label: "Drinking more water than usual", symptom: "drinking_more" },
  { label: "Blood in stool", symptom: "blood_in_stool" },
  { label: "Swollen abdomen", symptom: "swollen_abdomen" },
] as const;

export const QUICK_START_SYMPTOMS = QUICK_START_SYMPTOM_OPTIONS.map(
  (option) => option.label
);

const QUICK_START_SYMPTOM_ALIASES = QUICK_START_SYMPTOM_OPTIONS.reduce<
  Record<string, string[]>
>((aliases, option) => {
  aliases[option.symptom] = [...(aliases[option.symptom] ?? []), option.label];
  return aliases;
}, {});

export function getQuickStartSymptomAliases(symptom: string): readonly string[] {
  return QUICK_START_SYMPTOM_ALIASES[symptom] ?? [];
}
