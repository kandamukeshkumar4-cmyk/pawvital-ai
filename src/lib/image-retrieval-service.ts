import type { SupportedImageDomain } from "./clinical-evidence";
import {
  isImageRetrievalConfigured,
  retrieveVeterinaryImageEvidenceFromSidecar,
} from "./hf-sidecars";

export { isImageRetrievalConfigured };

export async function retrieveVeterinaryImageEvidence(input: {
  query: string;
  domain: SupportedImageDomain | null;
  breed?: string;
  conditionHints?: string[];
  dogOnly?: boolean;
  imageLimit?: number;
}) {
  return retrieveVeterinaryImageEvidenceFromSidecar(input);
}
