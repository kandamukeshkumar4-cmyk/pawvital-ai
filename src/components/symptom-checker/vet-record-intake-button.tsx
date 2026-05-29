"use client";

import { useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import Button from "@/components/ui/button";

type VetRecordIntakeButtonProps = {
  disabled?: boolean;
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

export function VetRecordIntakeButton({
  disabled = false,
  onContext,
}: VetRecordIntakeButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.set("file", file);

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

    throw new Error("DOCUMENT_INTAKE_UNAVAILABLE");
  };

  return (
    <>
      <Button
        aria-label={isUploading ? "Reading vet record" : "Attach vet record"}
        className="shrink-0 px-3"
        disabled={disabled || isUploading || isUnavailable}
        onClick={() => inputRef.current?.click()}
        title={
          isUnavailable ? "Vet record intake unavailable" : "Attach vet record"
        }
        type="button"
        variant="outline"
      >
        {isUploading ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        ) : (
          <FileText className="w-5 h-5 text-gray-500" />
        )}
      </Button>
      <input
        ref={inputRef}
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) {
            return;
          }
          setIsUploading(true);
          void uploadFile(file)
            .catch(() => {
              window.alert("Vet record intake is unavailable right now.");
            })
            .finally(() => setIsUploading(false));
        }}
        type="file"
      />
    </>
  );
}
