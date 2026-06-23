"use client";

import { useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

type VetRecordIntakeButtonProps = {
  disabled?: boolean;
  petId?: string | null;
  onContext(text: string): void;
};

type VetRecordIntakeResponse =
  | {
      enabled: false;
    }
  | {
      code?: string;
      enabled: boolean;
    }
  | {
      contextText: string;
      enabled: true;
    };

function isSuccessfulResponse(
  value: VetRecordIntakeResponse,
): value is { contextText: string; enabled: true } {
  return (
    value.enabled === true &&
    "contextText" in value &&
    Boolean(value.contextText)
  );
}

function failureMessageForResponse(
  payload: VetRecordIntakeResponse,
  status: number,
): string {
  if (payload.enabled === false) {
    return "Vet record intake is not enabled yet.";
  }
  if ("code" in payload && payload.code === "DOCUMENT_CONTENT_BLOCKED") {
    return "This vet record could not be imported after the safety screen.";
  }
  if (status === 400) {
    return "Upload a PDF vet record under 10 MB.";
  }
  return "Vet record intake is unavailable right now.";
}

export function VetRecordIntakeButton({
  disabled = false,
  petId,
  onContext,
}: VetRecordIntakeButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.set("file", file);
    // Send the owned pet id so the extracted summary becomes durable, pet-scoped
    // Dog Brain memory (vet_record_summaries), not just one-session context.
    if (petId) {
      formData.set("pet_id", petId);
    }

    const response = await fetch("/api/azure/documents/vet-record-intake", {
      body: formData,
      method: "POST",
    });
    const payload = (await response.json()) as VetRecordIntakeResponse;

    if (isSuccessfulResponse(payload)) {
      onContext(payload.contextText);
      return;
    }

    if (payload.enabled === false) {
      setIsUnavailable(true);
    }

    throw new Error(failureMessageForResponse(payload, response.status));
  };

  return (
    <>
      <button
        aria-label={isUploading ? "Reading vet record" : "Attach vet record"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8a8a8f] transition-all duration-150 hover:bg-[#eef6f1] hover:text-[#0b7a4d] active:scale-90 disabled:opacity-40"
        disabled={disabled || isUploading || isUnavailable}
        onClick={() => inputRef.current?.click()}
        title={
          isUnavailable ? "Vet record intake unavailable" : "Attach vet record"
        }
        type="button"
      >
        {isUploading ? (
          <Loader2 className="h-[19px] w-[19px] animate-spin text-[#8a8a8f]" />
        ) : (
          <FileText className="h-[19px] w-[19px]" strokeWidth={1.8} />
        )}
      </button>
      <input
        ref={inputRef}
        accept="application/pdf"
        aria-label="Upload vet record PDF"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) {
            return;
          }
          setIsUploading(true);
          void uploadFile(file)
            .catch((error: unknown) => {
              window.alert(
                error instanceof Error
                  ? error.message
                  : "Vet record intake is unavailable right now.",
              );
            })
            .finally(() => setIsUploading(false));
        }}
        type="file"
      />
    </>
  );
}
