"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import {
  Stethoscope,
  AlertTriangle,
  AlertCircle,
  Send,
  Loader2,
  Activity,
  Bot,
  User,
  Zap,
  RotateCcw,
  ImagePlus,
  X,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import PlanGate from "@/components/subscription/plan-gate";
import {
  ProgressBar,
  StateBadge,
  TerminalOutcomePanel,
  TerminalOutcomeStatusBadge,
  type TerminalOutcomeType,
} from "@/components/symptom-checker";
import type { ConversationState } from "@/lib/conversation-state/types";
import { resolveConversationStateFromSession } from "./conversation-state-ui";
import { useAppStore } from "@/store/app-store";
import { FullReport, type SymptomReport } from "@/components/symptom-report";

// --- Types ---

interface ImageMeta {
  width: number;
  height: number;
  blurScore: number;
  estimatedKb: number;
}

interface ImageGateWarning {
  reason: "blurry" | "low_resolution" | "not_close_up";
  topLabel?: string;
  topScore?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  type?:
    | "question"
    | "emergency"
    | "ready"
    | "report"
    | "error"
    | "image_gate"
    | "cannot_assess"
    | "out_of_scope";
  gate?: ImageGateWarning;
  image?: string;
  imageMeta?: Pick<ImageMeta, "width" | "height">;
  terminalState?: TerminalOutcomeType;
  reasonCode?: string | null;
  ownerMessage?: string | null;
  recommendedNextStep?: string | null;
  timestamp: Date;
}

interface SendMessageOptions {
  imageOverride?: string | null;
  imageMetaOverride?: ImageMeta | null;
  gateOverride?: boolean;
  appendUserMessage?: boolean;
}

// --- Config ---

const quickSymptoms = [
  "Not eating",
  "Limping",
  "Vomiting",
  "Diarrhea",
  "Lethargy",
  "Excessive scratching",
  "Coughing",
  "Difficulty breathing",
  "Trembling/shaking",
  "Drinking more water than usual",
  "Blood in stool",
  "Swollen abdomen",
];

// --- Components ---

function ChatBubble({
  message,
  highlightClarification = false,
  highlightEscalation = false,
}: {
  message: ChatMessage;
  highlightClarification?: boolean;
  highlightEscalation?: boolean;
}) {
  const isUser = message.role === "user";
  const isEmergency = message.type === "emergency";
  const isImageGate = message.type === "image_gate";
  const isCannotAssess = message.type === "cannot_assess";
  const isOutOfScope = message.type === "out_of_scope";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser
            ? "bg-blue-100"
            : isEmergency
              ? "bg-red-100"
              : isCannotAssess
                ? "bg-amber-100"
                : isOutOfScope
                  ? "bg-slate-100"
                  : isImageGate
                    ? "bg-amber-100"
                    : "bg-purple-100"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-blue-600" />
        ) : isEmergency ? (
          <AlertCircle className="w-4 h-4 text-red-600" />
        ) : isCannotAssess ? (
          <AlertTriangle className="w-4 h-4 text-amber-700" />
        ) : isOutOfScope ? (
          <Bot className="w-4 h-4 text-slate-600" />
        ) : isImageGate ? (
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        ) : (
          <Bot className="w-4 h-4 text-purple-600" />
        )}
      </div>
      <div
        className={`max-w-[min(85%,32rem)] rounded-2xl px-4 py-3 sm:max-w-[80%] ${
          isUser
            ? "bg-blue-600 text-white"
            : highlightEscalation
              ? "bg-red-50 border-2 border-red-500 text-red-900 animate-pulse"
              : highlightClarification
                ? "bg-orange-50 border border-orange-200 border-l-4 border-l-orange-400 text-orange-950"
                : isEmergency
                  ? "bg-red-50 border-2 border-red-300 text-red-900"
                  : isCannotAssess
                    ? "bg-amber-50 border border-amber-400 text-amber-950"
                    : isOutOfScope
                      ? "bg-slate-50 border border-slate-300 text-slate-900"
                      : isImageGate
                        ? "bg-amber-50 border border-amber-300 text-amber-950"
                        : "bg-gray-100 text-gray-800"
        }`}
      >
        {isCannotAssess && (
          <p className="mb-1 text-xs font-semibold text-amber-700">
            Cannot safely assess at home
          </p>
        )}
        {isOutOfScope && (
          <p className="mb-1 text-xs font-semibold text-slate-600">
            Outside symptom-triage scope
          </p>
        )}
        {message.image && (
          <Image
            src={message.image}
            alt="Uploaded by user"
            width={message.imageMeta?.width ?? 512}
            height={message.imageMeta?.height ?? 512}
            unoptimized
            className="w-full max-w-sm rounded-lg mb-2 border border-blue-400/30 object-contain"
          />
        )}
        {highlightClarification && (
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-orange-700">
            <span aria-hidden="true">↩</span>
            <span>Let me clarify...</span>
          </p>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
        <p
          className={`text-[10px] mt-1 ${
            isUser
              ? "text-blue-200"
              : isEmergency
                ? "text-red-400"
                : isCannotAssess
                  ? "text-amber-700"
                  : isOutOfScope
                    ? "text-slate-500"
                    : isImageGate
                      ? "text-amber-600"
                      : "text-gray-400"
          }`}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

// --- Main Page ---

export default function SymptomCheckerPage() {
  const { activePet } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageMeta, setSelectedImageMeta] = useState<ImageMeta | null>(
    null,
  );
  const [pendingGateImage, setPendingGateImage] = useState<string | null>(null);
  const [pendingGateImageMeta, setPendingGateImageMeta] =
    useState<ImageMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SymptomReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [readyForReport, setReadyForReport] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [conversationState, setConversationState] =
    useState<ConversationState>("idle");
  const [answeredCount, setAnsweredCount] = useState<number>(0);
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatRequestControllerRef = useRef<AbortController | null>(null);
  const reportRequestControllerRef = useRef<AbortController | null>(null);
  const sessionEpochRef = useRef(0);
  const sessionHandleRef = useRef<string | null>(null);

  // Hybrid triage session — passed to/from the API each turn
  // Use both state (for re-renders) and ref (to avoid stale closures in async sendMessage)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [, setTriageSession] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const triageSessionRef = useRef<any>(null);

  const pet = activePet || {
    name: "your dog",
    species: "dog",
    breed: "Unknown",
    age_years: 4,
    weight: 50,
    existing_conditions: [],
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const clearComposerImage = () => {
    setSelectedImage(null);
    setSelectedImageMeta(null);
  };

  const clearPendingGateImage = () => {
    setPendingGateImage(null);
    setPendingGateImageMeta(null);
  };

  const cancelInflightRequests = () => {
    chatRequestControllerRef.current?.abort();
    reportRequestControllerRef.current?.abort();
    chatRequestControllerRef.current = null;
    reportRequestControllerRef.current = null;
  };

  // ── Stage 1: Image Preprocessing ──
  // Resize to max 1024px, compress to JPEG 85%, detect blurry images
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    // Max 10MB raw upload
    if (file.size > 10 * 1024 * 1024) {
      alert("Image too large. Please upload an image under 10MB.");
      return;
    }

    const img = new window.Image();
    img.onload = () => {
      // Resize to max 1024px on longest side (saves bandwidth + API tokens)
      const MAX_SIZE = 1024;
      let width = img.width;
      let height = img.height;
      if (width > MAX_SIZE || height > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, width, height);

      // Blur detection: compute variance of Laplacian on grayscale
      const imageData = ctx.getImageData(0, 0, width, height);
      const blurScore = detectBlur(imageData);

      if (blurScore < 15) {
        // Very blurry — warn user but still allow
        alert(
          "This photo looks a bit blurry. For the best analysis, try taking a clearer, well-lit photo of the affected area.",
        );
      }

      // Compress to JPEG at 85% quality
      const base64 = canvas.toDataURL("image/jpeg", 0.85);
      const estimatedKb = Math.round((base64.length * 0.75) / 1024);
      setSelectedImage(base64);
      setSelectedImageMeta({
        width,
        height,
        blurScore: Number(blurScore.toFixed(1)),
        estimatedKb,
      });
      console.log(
        `[Preprocessing] ${img.width}x${img.height} → ${width}x${height}, blur=${blurScore.toFixed(1)}, size=${Math.round((base64.length * 0.75) / 1024)}KB`,
      );
    };

    img.src = URL.createObjectURL(file);

    // Clear the input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Laplacian variance blur detector — low score = blurry
  function detectBlur(imageData: ImageData): number {
    const { data, width, height } = imageData;
    // Convert to grayscale
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    // Compute Laplacian (3x3 kernel: 0,-1,0 / -1,4,-1 / 0,-1,0)
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const lap =
          4 * gray[idx] -
          gray[idx - 1] -
          gray[idx + 1] -
          gray[idx - width] -
          gray[idx + width];
        sum += lap;
        sumSq += lap * lap;
        count++;
      }
    }
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    return variance;
  }

  // Build API-compatible messages array from current state
  const getApiMessages = (
    extraMessages?: { role: string; content: string }[],
  ) => {
    const base = messages
      .filter((m) => m.type !== "image_gate")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    return extraMessages ? [...base, ...extraMessages] : base;
  };

  const syncProgressFromSession = (session: unknown) => {
    if (!session || typeof session !== "object") {
      return;
    }

    const {
      answered_questions: answeredQuestions,
      unresolved_question_ids: unresolvedQuestionIds,
    } = session as {
      answered_questions?: Record<string, unknown>;
      unresolved_question_ids?: unknown[];
    };

    const answered = answeredQuestions
      ? Object.keys(answeredQuestions).length
      : 0;
    const unresolved = Array.isArray(unresolvedQuestionIds)
      ? unresolvedQuestionIds.length
      : 0;

    setAnsweredCount(answered);
    setTotalQuestions(answered + unresolved);
  };

  // --- Send message to hybrid /api/ai/symptom-chat ---
  const sendMessage = async (
    text?: string,
    options: SendMessageOptions = {},
  ) => {
    const {
      imageOverride,
      imageMetaOverride,
      gateOverride = false,
      appendUserMessage = true,
    } = options;
    const messageText = text ?? input.trim();
    const imageToSend = imageOverride ?? selectedImage;
    const imageMetaToSend = imageMetaOverride ?? selectedImageMeta;
    if ((!messageText && !imageToSend) || loading) return;

    let userMessage: ChatMessage | null = null;
    if (appendUserMessage) {
      const nextUserMessage: ChatMessage = {
        role: "user",
        content: messageText || "Uploaded an image for analysis.",
        image: imageToSend || undefined,
        imageMeta: imageMetaToSend
          ? {
              width: imageMetaToSend.width,
              height: imageMetaToSend.height,
            }
          : undefined,
        timestamp: new Date(),
      };
      userMessage = nextUserMessage;
      setMessages((prev) => [...prev, nextUserMessage]);
      setInput("");
      clearComposerImage();
    }

    if (imageToSend) {
      setPendingGateImage(imageToSend);
      setPendingGateImageMeta(imageMetaToSend ?? null);
    }

    setReportError(null);
    setSessionStarted(true);
    setLoading(true);

    try {
      const controller = new AbortController();
      chatRequestControllerRef.current?.abort();
      chatRequestControllerRef.current = controller;
      const sessionEpoch = sessionEpochRef.current;
      const baseMessages = getApiMessages();
      const apiMsgs =
        appendUserMessage && userMessage
          ? [
              ...baseMessages,
              { role: "user" as const, content: userMessage.content },
            ]
          : baseMessages;

      const res = await fetch("/api/ai/symptom-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: apiMsgs,
          pet,
          action: "chat",
          session: sessionHandleRef.current ? undefined : triageSessionRef.current,
          sessionHandle: sessionHandleRef.current ?? undefined,
          image: imageToSend, // Send the base64 image here
          imageMeta: imageMetaToSend,
          gateOverride,
        }),
      });

      const data = await res.json();
      if (sessionEpoch !== sessionEpochRef.current) {
        return;
      }

      // Always store returned session state (both state and ref)
      if (data.session) {
        setTriageSession(data.session);
        triageSessionRef.current = data.session;
        syncProgressFromSession(data.session);
      }
      if (typeof data.sessionHandle === "string" && data.sessionHandle.trim()) {
        sessionHandleRef.current = data.sessionHandle;
      }

      // Update conversation state from API response
      if (data.conversationState) {
        setConversationState(data.conversationState);
      } else if (data.type === "emergency") {
        setConversationState("escalation");
      } else if (data.type === "cannot_assess") {
        setConversationState("escalation");
      } else if (data.type === "out_of_scope") {
        setConversationState("idle");
      } else if (data.type === "ready") {
        setConversationState("confirmed");
      } else if (data.type === "question") {
        setConversationState("asking");
      } else if (data.session) {
        // Fallback: infer from session data when API doesn't include conversationState
        const inferred = resolveConversationStateFromSession(
          data.session,
          undefined,
        );
        setConversationState(inferred);
      }

      if (data.type === "emergency") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.message,
            type: "emergency",
            timestamp: new Date(),
          },
        ]);
        clearPendingGateImage();
        setReadyForReport(true);
      } else if (data.type === "image_gate") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.message,
            type: "image_gate",
            gate: data.gate,
            timestamp: new Date(),
          },
        ]);
      } else if (data.type === "ready") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.message,
            type: "ready",
            timestamp: new Date(),
          },
        ]);
        clearPendingGateImage();
        // Auto-trigger report generation with the latest session + messages
        void generateReport(
          [...apiMsgs, { role: "assistant", content: data.message }],
          data.session || triageSessionRef.current,
        );
      } else {
        const isTerminalOutcome =
          data.type === "cannot_assess" || data.type === "out_of_scope";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              isTerminalOutcome && typeof data.owner_message === "string"
                ? data.owner_message
                : data.message,
            type: data.type,
            terminalState:
              isTerminalOutcome && typeof data.terminal_state === "string"
                ? data.terminal_state
                : undefined,
            reasonCode:
              isTerminalOutcome && typeof data.reason_code === "string"
                ? data.reason_code
                : null,
            ownerMessage:
              isTerminalOutcome && typeof data.owner_message === "string"
                ? data.owner_message
                : null,
            recommendedNextStep:
              isTerminalOutcome &&
              typeof data.recommended_next_step === "string"
                ? data.recommended_next_step
                : null,
            timestamp: new Date(),
          },
        ]);
        if (data.type !== "error") {
          clearPendingGateImage();
        }
        if (data.ready_for_report) {
          setReadyForReport(true);
        } else {
          // Reset when conversation continues (not in terminal report state)
          setReadyForReport(false);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I had trouble connecting. Please try again.",
          type: "error",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const generateReport = async (
    overrideMessages?: { role: string; content: string }[],
    overrideSession?: unknown,
  ) => {
    setGeneratingReport(true);
    setReportError(null);
    try {
      const controller = new AbortController();
      reportRequestControllerRef.current?.abort();
      reportRequestControllerRef.current = controller;
      const sessionEpoch = sessionEpochRef.current;
      const res = await fetch("/api/ai/symptom-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: overrideMessages || getApiMessages(),
          pet,
          action: "generate_report",
          session:
            sessionHandleRef.current
              ? undefined
              : overrideSession || triageSessionRef.current,
          sessionHandle: sessionHandleRef.current ?? undefined,
        }),
      });

      const data = await res.json();
      if (sessionEpoch !== sessionEpochRef.current) {
        return;
      }
      if (data.type === "report" && data.report) {
        setReport(data.report);
        return;
      }

      const message =
        data.owner_message ||
        data.message ||
        "I couldn’t generate the report safely right now. Please try again.";
      setReportError(message);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: message,
          type:
            data.type === "cannot_assess" ||
            data.type === "out_of_scope" ||
            data.type === "error"
              ? data.type
              : "error",
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      setReportError(
        "I had trouble generating the full report. You can try again using the button below.",
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I had trouble generating the full report. You can try again using the button below.",
          type: "error",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setGeneratingReport(false);
    }
  };

  const startNewSession = () => {
    sessionEpochRef.current += 1;
    cancelInflightRequests();
    setMessages([]);
    setReport(null);
    setReportError(null);
    setReadyForReport(false);
    setLoading(false);
    setGeneratingReport(false);
    setSessionStarted(false);
    setConversationState("idle");
    setAnsweredCount(0);
    setTotalQuestions(0);
    setTriageSession(null);
    triageSessionRef.current = null;
    sessionHandleRef.current = null;
    setInput("");
    clearComposerImage();
    clearPendingGateImage();
  };

  const latestAssistantIndex = [...messages]
    .map((msg, index) => ({ msg, index }))
    .reverse()
    .find(({ msg }) => msg.role === "assistant")?.index;
  const activeTerminalMessage =
    latestAssistantIndex === undefined
      ? null
      : (() => {
          const latestAssistantMessage = messages[latestAssistantIndex];
          if (
            latestAssistantMessage.type !== "cannot_assess" &&
            latestAssistantMessage.type !== "out_of_scope"
          ) {
            return null;
          }

          return latestAssistantMessage;
        })();
  const isTerminalConversation = activeTerminalMessage !== null;

  const handleRetakePhoto = () => {
    clearComposerImage();
    clearPendingGateImage();
    fileInputRef.current?.click();
  };

  const handleAnalyzeAnyway = () => {
    if (!pendingGateImage || loading) return;

    void sendMessage(undefined, {
      imageOverride: pendingGateImage,
      imageMetaOverride: pendingGateImageMeta,
      gateOverride: true,
      appendUserMessage: false,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <PlanGate requiredPlan="pro">
      <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                Veterinary Symptom Analyzer
              </h1>
              <Badge variant="info">
                <Activity className="w-3 h-3 mr-1" />
                Clinical Matrix AI
              </Badge>
            </div>
            <p className="text-gray-500 mt-1">
              4-Model Pipeline: Qwen 3.5 · Kimi K2.5 · Nemotron Ultra · GLM-5
            </p>
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto sm:flex-shrink-0">
            {sessionStarted && (
              <Button
                variant="secondary"
                onClick={startNewSession}
                disabled={loading || generatingReport}
                className="w-full flex-shrink-0 sm:w-auto"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                New Session
              </Button>
            )}
          </div>
        </div>

        {/* Pre-session: Welcome + Quick Start */}
        {!sessionStarted && (
          <Card className="p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">
                  Tell me what&apos;s going on with {pet.name}
                </h2>
                <p className="text-sm text-gray-500">
                  I&apos;ll ask follow-up questions like a real vet, then
                  generate a full clinical report with differential diagnoses
                </p>
              </div>
            </div>

            <div className="bg-purple-50 rounded-xl p-4 mb-4">
              <div className="flex items-start gap-2">
                <Bot className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="text-sm text-purple-900 font-medium">
                    How this works:
                  </p>
                  <ol className="text-sm text-purple-800 mt-1 space-y-1 list-decimal ml-4">
                    <li>
                      Describe what&apos;s happening in your own words or upload
                      a photo of the issue
                    </li>
                    <li>I&apos;ll ask 3-5 focused clinical questions</li>
                    <li>
                      I&apos;ll generate a full report: differential diagnoses,
                      diagnostic tests, home care, and vet prep questions
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Quick start symptom buttons */}
            <div>
              <p className="text-xs text-gray-500 mb-2">
                Quick start — or type your own below:
              </p>
              <div className="flex flex-wrap gap-2">
                {quickSymptoms.map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      sendMessage(`${pet.name} has been ${s.toLowerCase()}`)
                    }
                    className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Chat Messages */}
        {sessionStarted && (
          <Card className="p-0 overflow-hidden">
            {/* Chat header */}
            <div className="flex flex-wrap items-start gap-3 border-b border-gray-100 bg-gray-50/50 px-4 py-3">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <Bot className="w-4 h-4 text-purple-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  Veterinary Triage for {pet.name}
                </p>
                <p className="text-xs text-gray-500">
                  {pet.breed}, {pet.age_years}y, {pet.weight} lbs
                </p>
              </div>
              {!report && (
                <div className="ml-auto flex-shrink-0">
                  {activeTerminalMessage ? (
                    <TerminalOutcomeStatusBadge
                      type={
                        activeTerminalMessage.terminalState ??
                        (activeTerminalMessage.type as TerminalOutcomeType)
                      }
                    />
                  ) : (
                    <StateBadge state={conversationState} />
                  )}
                </div>
              )}
            </div>
            {!report && !isTerminalConversation && (
              <div className="px-4 pb-3">
                <ProgressBar
                  answered={answeredCount}
                  total={totalQuestions}
                  state={conversationState}
                />
              </div>
            )}

            {/* Messages area */}
            <div className="min-h-[200px] max-h-[60vh] space-y-4 overflow-y-auto p-4 sm:max-h-[500px]">
              {messages.map((msg, i) => (
                <div key={i} className="space-y-2">
                  <ChatBubble
                    message={msg}
                    highlightClarification={
                      conversationState === "needs_clarification" &&
                      msg.role === "assistant" &&
                      i === latestAssistantIndex
                    }
                    highlightEscalation={
                      conversationState === "escalation" &&
                      msg.role === "assistant" &&
                      i === latestAssistantIndex
                    }
                  />
                  {msg.type === "image_gate" &&
                    i === messages.length - 1 &&
                    pendingGateImage && (
                      <div className="pl-11 sm:ml-11 sm:pl-0">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={handleRetakePhoto}
                            disabled={loading}
                          >
                            Retake Photo
                          </Button>
                          <Button
                            onClick={handleAnalyzeAnyway}
                            disabled={loading}
                          >
                            Analyze Anyway
                          </Button>
                        </div>
                      </div>
                    )}
                  {(msg.type === "cannot_assess" ||
                    msg.type === "out_of_scope") &&
                    i === latestAssistantIndex && (
                      <div className="pl-11 sm:ml-11 sm:pl-0">
                        <TerminalOutcomePanel
                          type={
                            msg.terminalState ??
                            (msg.type as TerminalOutcomeType)
                          }
                          ownerMessage={msg.ownerMessage}
                          reasonCode={msg.reasonCode}
                          recommendedNextStep={msg.recommendedNextStep}
                          onStartNewSession={startNewSession}
                        />
                      </div>
                    )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                      <span className="text-sm text-gray-500">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input area — hide when report is generated */}
            {!report && !isTerminalConversation && (
              <div className="border-t border-gray-100 p-3">
                {selectedImage && (
                  <div className="mb-3 relative inline-block">
                    <Image
                      src={selectedImage}
                      alt="Preview"
                      width={selectedImageMeta?.width ?? 96}
                      height={selectedImageMeta?.height ?? 96}
                      unoptimized
                      className="h-24 w-auto rounded border border-gray-200 object-contain bg-gray-50"
                    />
                    <button
                      onClick={clearComposerImage}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-sm"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex min-w-0 flex-1 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="shrink-0 px-3"
                      title="Attach Photo"
                    >
                      <ImagePlus className="w-5 h-5 text-gray-500" />
                    </Button>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      ref={fileInputRef}
                      className="hidden"
                    />
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        messages.length === 0
                          ? `Describe what's going on with ${pet.name} or attach a photo...`
                          : "Type your answer or attach a photo..."
                      }
                      rows={2}
                      className="min-w-0 flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => sendMessage()}
                      disabled={(!input.trim() && !selectedImage) || loading}
                      className="w-full sm:h-full sm:w-auto"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Generate Report button */}
                {readyForReport && !generatingReport && (
                  <div className="mt-3 flex justify-center">
                    <button
                      onClick={() => generateReport()}
                      className={`flex w-full items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-all sm:w-auto ${
                        conversationState === "escalation"
                          ? "bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 shadow-lg shadow-red-200 animate-pulse"
                          : "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg shadow-purple-200"
                      }`}
                    >
                      {conversationState === "escalation" ? (
                        <>
                          <AlertCircle className="w-4 h-4" />
                          Generate Emergency Report
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Generate Full Veterinary Report
                        </>
                      )}
                    </button>
                  </div>
                )}
                {reportError && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {reportError}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {!sessionStarted && !report && (
          <div className="p-3 bg-white border border-gray-200 rounded-xl">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex min-w-0 flex-1 gap-2">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 px-3"
                  title="Attach Photo"
                >
                  <ImagePlus className="w-5 h-5 text-gray-500" />
                </Button>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  ref={fileInputRef}
                  className="hidden"
                />
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Describe what's going on with ${pet.name} or attach a photo...`}
                  rows={2}
                  className="min-w-0 flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => sendMessage()}
                  disabled={(!input.trim() && !selectedImage) || loading}
                  className="w-full sm:h-full sm:w-auto"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {selectedImage && (
              <div className="mt-3 relative inline-block">
                <Image
                  src={selectedImage}
                  alt="Preview"
                  width={selectedImageMeta?.width ?? 96}
                  height={selectedImageMeta?.height ?? 96}
                  unoptimized
                  className="h-24 w-auto rounded border border-gray-200 object-contain bg-gray-50"
                />
                <button
                  onClick={clearComposerImage}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-sm"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Generating Report Loading State */}
        {generatingReport && (
          <Card className="p-8 text-center animate-pulse">
            <Stethoscope className="w-12 h-12 text-purple-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">
              Generating Veterinary Report...
            </h3>
            <p className="text-sm text-gray-500 mt-2">
              Analyzing full conversation history, building differential
              diagnoses with breed-specific data, and preparing diagnostic
              recommendations...
            </p>
          </Card>
        )}

        {/* Full Report */}
        {report && <FullReport report={report} />}
      </div>
    </PlanGate>
  );
}
