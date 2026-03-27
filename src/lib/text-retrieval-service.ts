import type { SupportedImageDomain } from "./clinical-evidence";
import {
  isTextRetrievalConfigured,
  retrieveVeterinaryTextEvidenceFromSidecar,
} from "./hf-sidecars";

export { isTextRetrievalConfigured };

export async function retrieveVeterinaryTextEvidence(input: {
  query: string;
  domain: SupportedImageDomain | null;
  breed?: string;
  conditionHints?: string[];
  dogOnly?: boolean;
  textLimit?: number;
}) {
  return retrieveVeterinaryTextEvidenceFromSidecar(input);
}
