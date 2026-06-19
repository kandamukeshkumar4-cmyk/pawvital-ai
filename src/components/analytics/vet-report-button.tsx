"use client";

import { FileDown } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";

/**
 * Download button for the Vet-Ready Timeline PDF. Renders only when a real pet
 * id is available (the PDF endpoint is auth + owner-scoped). The browser handles
 * the download via the attachment Content-Disposition.
 */
export function VetReportButton({ petId }: { petId: string | null }) {
  if (!petId) return null;
  return (
    <a
      href={`/api/analytics/vet-timeline/pdf?pet_id=${encodeURIComponent(petId)}`}
      className={`${buttonClassName({ variant: "outline", size: "sm" })} inline-flex border-[#cfe6dd] text-[#0a7d5b]`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <FileDown className="mr-1.5 h-4 w-4" aria-hidden />
      Download vet report (PDF)
    </a>
  );
}
