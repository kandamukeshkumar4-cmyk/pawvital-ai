"use client";

import {
  useCallback,
  useState,
  useRef,
  useEffect,
  useSyncExternalStore,
} from "react";
import {
  Stethoscope,
  AlertTriangle,
  AlertCircle,
  Send,
  Loader2,
  Bot,
  User,
  Zap,
  RotateCcw,
  ImagePlus,
  X,
  ShieldCheck,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button, { buttonClassName } from "@/components/ui/button";
import TesterOnboardingGate from "@/components/tester-onboarding/tester-onboarding-gate";
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
import { SpeechInputButton } from "@/components/symptom-checker/speech-input-button";
import { VetRecordIntakeButton } from "@/components/symptom-checker/vet-record-intake-button";
import { SymptomContextStrip, SymptomRemembersPanel } from "@/components/symptom-checker/context-rail";
import { QUICK_START_SYMPTOMS } from "@/lib/symptom-chat/quick-start-symptoms";
import {
  useWebPubSubLiveUpdates,
  type TriageLiveUpdateConnectionState,
} from "@/components/symptom-checker/use-webpubsub-live-updates";
import type {
  TriageLiveUpdate,
  TriageLiveUpdateStatus,
} from "@/lib/azure/web-pubsub";
import { SYMPTOM_CHAT_REQUEST_TIMEOUT_MS } from "@/lib/symptom-chat/request-timeout";
import { computeConversationProgress } from "@/lib/symptom-checker/session-progress";
import type { TriageSession } from "@/lib/triage-engine";
import { useSymptomTranslator } from "@/hooks/useSymptomTranslator";

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
  apiContent?: string;
  ownerLanguage?: string | null;
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
  terminalState?: TerminalOutcomeType;
  reasonCode?: string | null;
  ownerMessage?: string | null;
  recommendedNextStep?: string | null;
  askingBecause?: string | null;
  promptVetRecord?: boolean;
  timestamp: Date;
}

interface SendMessageOptions {
  imageOverride?: string | null;
  imageMetaOverride?: ImageMeta | null;
  gateOverride?: boolean;
  gateOverrideTokenOverride?: string | null;
  appendUserMessage?: boolean;
}

// --- Config ---

const quickSymptoms = QUICK_START_SYMPTOMS;

function subscribeToHydration() {
  return () => {};
}

function createLiveSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `triage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}

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
        className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full"
        style={{
          background: isUser
            ? "#dcefe2"
            : isEmergency
              ? "#fdeeec"
              : isCannotAssess || isImageGate
                ? "#fdf3e3"
                : isOutOfScope
                  ? "#efeee9"
                  : "#eaf3ee",
          color: isUser
            ? "#1d3a2a"
            : isEmergency
              ? "#cf4338"
              : isCannotAssess || isImageGate
                ? "#b5740a"
                : isOutOfScope
                  ? "#6f7069"
                  : "#0b7a4d",
        }}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : isEmergency ? (
          <AlertCircle className="h-4 w-4" />
        ) : isCannotAssess ? (
          <AlertTriangle className="h-4 w-4" />
        ) : isOutOfScope ? (
          <Bot className="h-4 w-4" />
        ) : isImageGate ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Stethoscope className="h-4 w-4" />
        )}
      </div>
      <div
        className="max-w-[min(85%,32rem)] px-4 py-3 text-[#1d1d1b] sm:max-w-[80%]"
        style={{
          borderRadius: isUser ? "14px 14px 4px 14px" : "4px 14px 14px 14px",
          background: isUser
            ? "#dcefe2"
            : highlightEscalation
              ? "#fdeeec"
              : highlightClarification
                ? "#fdf3e3"
                : isEmergency
                  ? "#fdeeec"
                  : isCannotAssess || isImageGate
                    ? "#fdf3e3"
                    : isOutOfScope
                      ? "#efeee9"
                      : "#f6f5f1",
          color: isUser
            ? "#1d3a2a"
            : highlightEscalation || isEmergency
              ? "#cf4338"
              : highlightClarification || isCannotAssess || isImageGate
                ? "#b5740a"
                : isOutOfScope
                  ? "#6f7069"
                  : "#1d1d1b",
          border: isUser
            ? undefined
            : highlightEscalation || isEmergency
              ? "1px solid #f7dad6"
              : highlightClarification || isCannotAssess || isImageGate
                ? "1px solid #f3e2c2"
                : isOutOfScope
                  ? "1px solid #ebeae5"
                  : "1px solid #efeee9",
        }}
      >
        {isCannotAssess && (
          <p className="mb-1 text-xs font-semibold" style={{ color: "#b5740a" }}>
            Cannot safely assess at home
          </p>
        )}
        {isOutOfScope && (
          <p className="mb-1 text-xs font-semibold" style={{ color: "#6f7069" }}>
            Outside symptom-triage scope
          </p>
        )}
        {message.image && (
          <img
            src={message.image}
            alt="Uploaded by user"
            className="mb-2 w-full max-w-sm rounded-lg border object-contain"
            style={{ borderColor: "#ebeae5" }}
          />
        )}
        {highlightClarification && (
          <p
            className="mb-1 flex items-center gap-1 text-xs font-semibold"
            style={{ color: "#b5740a" }}
          >
            <span aria-hidden="true">↩</span>
            <span>Let me clarify...</span>
          </p>
        )}
        {message.askingBecause && !isUser && (
          <p
            className="mb-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
            style={{
              background: "#f0f5fb",
              border: "1px solid #d5e4f2",
              color: "#3a5a82",
            }}
          >
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            <span>
              <span className="font-bold">Why I&apos;m asking: </span>
              {message.askingBecause}
            </span>
          </p>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
        <p
          className="mt-1 text-[10px]"
          style={{
            color: isUser
              ? "#1d3a2a"
              : isEmergency
                ? "#cf4338"
                : isCannotAssess || isImageGate
                  ? "#b5740a"
                  : isOutOfScope
                    ? "#9a9b93"
                    : "#9a9b93",
            opacity: isUser ? 0.7 : 1,
          }}
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
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageMeta, setSelectedImageMeta] = useState<ImageMeta | null>(
    null,
  );
  const [pendingGateImage, setPendingGateImage] = useState<string | null>(null);
  const [pendingGateImageMeta, setPendingGateImageMeta] =
    useState<ImageMeta | null>(null);
  const [pendingGateToken, setPendingGateToken] = useState<string | null>(
    null,
  );
  const [promptVetRecord, setPromptVetRecord] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SymptomReport | null>(null);
  const [reportPersistenceMessage, setReportPersistenceMessage] =
    useState<string | null>(null);
  const [readyForReport, setReadyForReport] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [conversationState, setConversationState] =
    useState<ConversationState>("idle");
  const [answeredCount, setAnsweredCount] = useState<number>(0);
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const liveSessionIdRef = useRef<string | null>(null);
  if (liveSessionIdRef.current === null) {
    liveSessionIdRef.current = createLiveSessionId();
  }
  const [, setLiveUpdateStatus] = useState<TriageLiveUpdateStatus | null>(null);
  const [, setLiveConnectionState] =
    useState<TriageLiveUpdateConnectionState>("disabled");
  // Async-turn delivery (Service Bus + Web PubSub). When the route returns 202
  // the turn is processed by the worker; the result arrives via a live-update
  // ping (or polling) and is applied through the same response handler.
  const [awaitingAsyncResult, setAwaitingAsyncResult] = useState(false);
  const asyncPendingRef = useRef<{ jobId: string } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestApplyResponseRef = useRef<((data: any) => Promise<void>) | null>(
    null,
  );
  const fetchAsyncResultRef = useRef<(() => Promise<void>) | null>(null);
  const fetchInFlightRef = useRef(false);
  const {
    localizeAssistantText,
    localizeReport,
    normalizeOwnerMessage,
    resetOwnerLanguage,
  } = useSymptomTranslator();

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
  // Title-case at the source so every consumer (H1, context strip, chat header)
  // shows "Bruno", never raw lowercase "bruno".
  const displayPetName = hasHydrated
    ? pet.name.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
    : "your dog";
  const displayPetBreed = hasHydrated ? pet.breed : "Unknown";
  const displayPetAgeYears = hasHydrated ? pet.age_years : 4;
  const displayPetWeight = hasHydrated ? pet.weight : 50;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!report) {
      return;
    }

    reportRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [report]);

  const handleLiveUpdate = useCallback((update: TriageLiveUpdate) => {
    setLiveUpdateStatus(update.status);
    if (
      update.status === "response_ready" ||
      update.status === "report_ready"
    ) {
      void fetchAsyncResultRef.current?.();
    } else if (update.status === "failed") {
      asyncPendingRef.current = null;
      setAwaitingAsyncResult(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I had trouble completing that. Please try again.",
          type: "error",
          timestamp: new Date(),
        },
      ]);
    }
  }, []);

  const handleLiveConnectionState = useCallback(
    (state: TriageLiveUpdateConnectionState) => {
      setLiveConnectionState(state);
    },
    [],
  );

  useWebPubSubLiveUpdates({
    enabled: Boolean(pet),
    onConnectionState: handleLiveConnectionState,
    onUpdate: handleLiveUpdate,
    sessionId: liveSessionIdRef.current,
  });

  // Fetch the async turn result and apply it through the shared response handler.
  // Invoked by the live-update ping and by the polling fallback below.
  const fetchAndApplyAsyncResult = async () => {
    const pending = asyncPendingRef.current;
    // Guard against concurrent calls from the polling interval and a
    // live-update ping arriving simultaneously — without this, both would
    // fetch the result and call applyResponse twice, duplicating the
    // assistant message.
    if (!pending || fetchInFlightRef.current) {
      return;
    }
    fetchInFlightRef.current = true;
    try {
      const res = await fetch(
        `/api/ai/symptom-chat/result?jobId=${encodeURIComponent(pending.jobId)}`,
        { cache: "no-store" },
      );
      if (res.status === 202) {
        return; // still processing — keep waiting / polling
      }
      const payload = await res.json().catch(() => null);
      asyncPendingRef.current = null;
      if (res.ok && payload?.body) {
        await latestApplyResponseRef.current?.(payload.body);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I had trouble completing that. Please try again.",
            type: "error",
            timestamp: new Date(),
          },
        ]);
      }
      setAwaitingAsyncResult(false);
    } catch {
      // Transient — the next poll tick retries while awaitingAsyncResult holds.
    } finally {
      fetchInFlightRef.current = false;
    }
  };
  fetchAsyncResultRef.current = fetchAndApplyAsyncResult;

  useEffect(() => {
    if (!awaitingAsyncResult) {
      return;
    }
    const pollId = setInterval(() => {
      void fetchAsyncResultRef.current?.();
    }, 3000);
    return () => clearInterval(pollId);
  }, [awaitingAsyncResult]);

  const clearComposerImage = () => {
    setSelectedImage(null);
    setSelectedImageMeta(null);
  };

  const clearPendingGateImage = () => {
    setPendingGateImage(null);
    setPendingGateImageMeta(null);
    setPendingGateToken(null);
  };

  const appendTranscriptToInput = (transcript: string) => {
    setInput((current) => {
      const trimmedCurrent = current.trimEnd();
      return trimmedCurrent ? `${trimmedCurrent} ${transcript}` : transcript;
    });
    inputRef.current?.focus();
  };

  const appendVetRecordContextToInput = (context: string) => {
    setInput((current) => {
      const trimmedCurrent = current.trimEnd();
      return trimmedCurrent ? `${trimmedCurrent}\n\n${context}` : context;
    });
    const session = triageSessionRef.current;
    if (session) {
      const nextSession = {
        ...session,
        case_memory: {
          ...(session.case_memory ?? {}),
          vet_record_context: context,
        },
      };
      setTriageSession(nextSession);
      triageSessionRef.current = nextSession;
    }
    setPromptVetRecord(false);
    inputRef.current?.focus();
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

    const img = new Image();
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
      URL.revokeObjectURL(img.src);
    };

    const objectUrl = URL.createObjectURL(file);
    img.onerror = () => URL.revokeObjectURL(objectUrl);
    img.src = objectUrl;

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
        content: m.apiContent ?? m.content,
      }));
    return extraMessages ? [...base, ...extraMessages] : base;
  };

  const syncProgressFromSession = (session: unknown) => {
    if (!session || typeof session !== "object") {
      return;
    }

    const { answered, total } = computeConversationProgress(
      session as TriageSession
    );
    setAnsweredCount(answered);
    setTotalQuestions(total);
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
      gateOverrideTokenOverride,
      appendUserMessage = true,
    } = options;
    const messageText = text ?? input.trim();
    const imageToSend = imageOverride ?? selectedImage;
    const imageMetaToSend = imageMetaOverride ?? selectedImageMeta;
    if ((!messageText && !imageToSend) || loading || awaitingAsyncResult)
      return;

    const normalizedUserText =
      appendUserMessage && messageText
        ? await normalizeOwnerMessage(messageText)
        : null;

    let userMessage: ChatMessage | null = null;
    if (appendUserMessage) {
      const nextUserMessage: ChatMessage = {
        role: "user",
        content: messageText || "Uploaded an image for analysis.",
        apiContent: normalizedUserText?.translated
          ? normalizedUserText.apiText
          : undefined,
        ownerLanguage: normalizedUserText?.ownerLanguage,
        image: imageToSend || undefined,
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

    setSessionStarted(true);
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      SYMPTOM_CHAT_REQUEST_TIMEOUT_MS,
    );

    try {
      const baseMessages = getApiMessages();
      const apiMsgs =
        appendUserMessage && userMessage
          ? [
              ...baseMessages,
              {
                role: "user" as const,
                content: userMessage.apiContent ?? userMessage.content,
              },
            ]
          : baseMessages;

      const res = await fetch("/api/ai/symptom-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMsgs,
          pet,
          action: "chat",
          session: triageSessionRef.current,
          liveSessionId: liveSessionIdRef.current,
          image: imageToSend, // Send the base64 image here
          imageMeta: imageMetaToSend,
          gateOverride,
          gateOverrideToken: gateOverrideTokenOverride ?? undefined,
        }),
        signal: controller.signal,
      });

      const data = await res.json();

      // Apply one turn response. Shared by the synchronous reply and the result
      // fetched after an async response_ready ping. `apiMsgs` is captured here so
      // a later async application uses this turn's message context.
      // IMPORTANT: defined and stored in ref BEFORE the 202 branch below so that
      // fetchAndApplyAsyncResult always has a valid current-turn closure even when
      // sendMessage exits early on the async-offload path.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const applyResponse = async (data: any) => {
      // Always store returned session state (both state and ref)
      if (data.session) {
        setTriageSession(data.session);
        triageSessionRef.current = data.session;
        syncProgressFromSession(data.session);
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

      // Localize the assistant, terminal-owner, and next-step strings in
      // parallel instead of three serial round-trips — one round-trip of
      // latency per turn for non-English owners. Each entry is produced by the
      // same localizeAssistantText call as before (the inputs are independent),
      // so translation/fallback behavior is unchanged; only the ordering is.
      const [assistantText, terminalOwnerText, terminalNextStepText] =
        await Promise.all([
          typeof data.message === "string"
            ? localizeAssistantText(data.message)
            : Promise.resolve(null),
          typeof data.owner_message === "string"
            ? localizeAssistantText(data.owner_message)
            : Promise.resolve(null),
          typeof data.recommended_next_step === "string"
            ? localizeAssistantText(data.recommended_next_step)
            : Promise.resolve(null),
        ]);

      if (data.type === "emergency") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantText?.content ?? data.message,
            apiContent: assistantText?.apiContent,
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
            content: assistantText?.content ?? data.message,
            apiContent: assistantText?.apiContent,
            type: "image_gate",
            gate: data.gate,
            timestamp: new Date(),
          },
        ]);
        setPendingGateToken(
          typeof data.gate_override_token === "string"
            ? data.gate_override_token
            : null,
        );
      } else if (data.type === "ready") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantText?.content ?? data.message,
            apiContent: assistantText?.apiContent,
            type: "ready",
            timestamp: new Date(),
          },
        ]);
        clearPendingGateImage();
        // Auto-trigger report generation with the latest session + messages
        generateReport(
          [...apiMsgs, { role: "assistant", content: data.message }],
          data.session || triageSessionRef.current,
        );
      } else {
        const isTerminalOutcome =
          data.type === "cannot_assess" || data.type === "out_of_scope";
        if (typeof data.prompt_vet_record === "boolean") {
          setPromptVetRecord(data.prompt_vet_record);
        }
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              isTerminalOutcome && terminalOwnerText
                ? terminalOwnerText.content
                : assistantText?.content ?? data.message,
            apiContent:
              isTerminalOutcome && terminalOwnerText
                ? terminalOwnerText.apiContent
                : assistantText?.apiContent,
            type: data.type,
            askingBecause:
              typeof data.asking_because === "string"
                ? data.asking_because
                : null,
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
                ? terminalOwnerText?.content ?? data.owner_message
                : null,
            recommendedNextStep:
              isTerminalOutcome &&
              typeof data.recommended_next_step === "string"
                ? terminalNextStepText?.content ?? data.recommended_next_step
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
      };
      latestApplyResponseRef.current = applyResponse;

      // Async offload: the worker will process this turn and deliver the result
      // via a live-update ping (handleLiveUpdate) or the polling fallback.
      if (
        res.status === 202 &&
        data?.type === "async_pending" &&
        typeof data.jobId === "string"
      ) {
        asyncPendingRef.current = { jobId: data.jobId };
        setAwaitingAsyncResult(true);
        return;
      }

      await applyResponse(data);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: isAbortError(error)
            ? "The symptom checker took too long to respond. Please try again."
            : "I had trouble connecting. Please try again.",
          type: "error",
          timestamp: new Date(),
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const generateReport = async (
    overrideMessages?: { role: string; content: string }[],
    overrideSession?: unknown,
  ) => {
    setGeneratingReport(true);
    try {
      const res = await fetch("/api/ai/symptom-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: overrideMessages || getApiMessages(),
          pet,
          action: "generate_report",
          session: overrideSession || triageSessionRef.current,
          liveSessionId: liveSessionIdRef.current,
        }),
      });

      const data = await res.json();
      const shouldRenderReport =
        data.type === "report" ||
        (data.type === "cannot_assess" &&
          data.report?.report_mode === "terminal_cannot_assess");
      if (shouldRenderReport && data.report) {
        setReport(await localizeReport(data.report));
        setReportPersistenceMessage(
          typeof data.persistence?.message === "string"
            ? data.persistence.message
            : null
        );
      }
    } catch {
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
    setMessages([]);
    setReport(null);
    setReportPersistenceMessage(null);
    setReadyForReport(false);
    setGeneratingReport(false);
    setSessionStarted(false);
    setConversationState("idle");
    setAnsweredCount(0);
    setTotalQuestions(0);
    resetOwnerLanguage();
    setTriageSession(null);
    triageSessionRef.current = null;
    liveSessionIdRef.current = createLiveSessionId();
    setLiveUpdateStatus(null);
    setLiveConnectionState("disabled");
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
      gateOverrideTokenOverride: pendingGateToken,
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
    <TesterOnboardingGate>
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{ background: "#e9f6ef", color: "#0b7a4d" }}
                title="Urgency guidance"
                aria-label="Urgency guidance"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
              </span>
              <h1
                className="text-[21px] font-bold leading-tight"
                style={{ color: "#1d1d1b" }}
              >
                Dog symptom check for {displayPetName}
              </h1>
            </div>
            <p className="mt-1 text-[15px]" style={{ color: "#6f7069" }}>
              We&apos;ll ask a few focused questions to understand what&apos;s going on.
            </p>
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto sm:flex-shrink-0">
            {sessionStarted && (
              <Button
                variant="outline"
                onClick={startNewSession}
                className="w-full flex-shrink-0 sm:w-auto"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                New Session
              </Button>
            )}
          </div>
        </div>

        {/* Emergency banner (mockup #2) */}
        <div
          className="flex flex-wrap items-center gap-3 px-4 py-3"
          style={{
            background: "linear-gradient(90deg,#fdeeec,#fdf6f4)",
            border: "1px solid #f6dad5",
            borderRadius: "13px",
          }}
        >
          <AlertTriangle
            className="h-5 w-5 flex-shrink-0"
            style={{ color: "#cf4338" }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" style={{ color: "#cf4338" }}>
              Emergency signs detected?
            </p>
            <p className="text-[13px] leading-snug" style={{ color: "#9c5b53" }}>
              If your dog has difficulty breathing, collapses, has repeated seizures, severe bleeding, or is
              unable to stand or urinate, go to an emergency vet now.
            </p>
          </div>
        </div>

        {/* Dog Brain context strip (mockup #2) — real counts */}
        <SymptomContextStrip petId={activePet?.id ?? null} petName={displayPetName} />

        {/* Chat (left) + What PawVital remembers (right) */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4 sm:space-y-6">

        {/* Pre-session: Welcome + Quick Start */}
        {!sessionStarted && (
          <Card className="p-4 sm:p-6" style={{ border: "1px solid #ebeae5", borderRadius: "16px" }}>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: "#e9f6ef", color: "#0b7a4d" }}
              >
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold" style={{ color: "#1d1d1b" }}>
                  Tell me what&apos;s going on with {displayPetName}
                </h2>
                <p className="text-sm" style={{ color: "#6f7069" }}>
                  I&apos;ll guide a dog-only symptom check, ask focused follow-up
                  questions, and prepare a vet handoff summary with urgency
                  guidance. PawVital does not diagnose or prescribe treatment.
                </p>
              </div>
            </div>

            <div
              className="mb-4 rounded-xl p-4"
              style={{ background: "#e9f6ef", border: "1px solid #cfe6da" }}
            >
              <div className="flex items-start gap-2">
                <Bot className="mt-0.5 h-5 w-5" style={{ color: "#0b7a4d" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "#0b7a4d" }}>
                    How this works:
                  </p>
                  <ol
                    className="mt-1 ml-4 list-decimal space-y-1 text-sm"
                    style={{ color: "#0b7a4d" }}
                  >
                    <li>
                      Describe what&apos;s happening in your own words or upload
                      a photo of the issue
                    </li>
                    <li>I&apos;ll ask 3-5 focused questions about urgency</li>
                    <li>
                      I&apos;ll prepare a vet handoff summary with urgency
                      guidance, important details, and what to watch for
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Quick start symptom buttons */}
            <div>
              <p className="mb-2 text-xs" style={{ color: "#6f7069" }}>
                Quick start — or type your own below:
              </p>

              <div className="flex flex-wrap gap-2">
                {quickSymptoms.map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      sendMessage(
                        `${hasHydrated ? pet.name : "My dog"} has been ${s.toLowerCase()}`,
                      )
                    }
                    className="rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-[#e9f6ef]"
                    style={{ border: "1px solid #cfe6da", color: "#0b7a4d" }}
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
          <Card
            className="overflow-hidden p-0"
            style={{ border: "1px solid #ebeae5", borderRadius: "16px" }}
          >
            {/* Chat header */}
            <div
              className="flex flex-wrap items-start gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid #ebeae5", background: "#fff" }}
            >
              <div
                className="flex h-[34px] w-[34px] items-center justify-center rounded-full"
                style={{ background: "#e9f6ef", color: "#0b7a4d" }}
              >
                <Stethoscope className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#1d1d1b" }}>
                  Dog symptom check for {displayPetName}
                </p>
                <p className="text-xs" style={{ color: "#9a9b93" }}>
                  {displayPetBreed}, {displayPetAgeYears}y, {displayPetWeight} lbs
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
                            disabled={loading || awaitingAsyncResult}
                          >
                            Retake Photo
                          </Button>
                          <Button
                            onClick={handleAnalyzeAnyway}
                            disabled={loading || awaitingAsyncResult}
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

              {(loading || awaitingAsyncResult) && (
                <div className="flex gap-3">
                  <div
                    className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: "#eaf3ee", color: "#0b7a4d" }}
                  >
                    <Stethoscope className="h-4 w-4" />
                  </div>
                  <div
                    className="px-4 py-3"
                    style={{
                      background: "#f6f5f1",
                      border: "1px solid #efeee9",
                      borderRadius: "4px 14px 14px 14px",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#0b7a4d" }} />
                      <span className="text-sm" style={{ color: "#6f7069" }}>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input area — hide when report is generated */}
            {!report && !isTerminalConversation && (
              <div className="p-3" style={{ borderTop: "1px solid #ebeae5" }}>
                {selectedImage && (
                  <div className="mb-3 relative inline-block">
                    <img
                      src={selectedImage}
                      alt="Preview"
                      className="h-24 rounded object-contain"
                      style={{ border: "1px solid #ebeae5", background: "#f5f5f7" }}
                    />
                    <button
                      onClick={clearComposerImage}
                      className="absolute -top-2 -right-2 rounded-full p-1 text-white shadow-sm"
                      style={{ background: "#cf4338" }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {promptVetRecord && (
                  <div
                    className="mb-3 rounded-lg px-3 py-2 text-sm"
                    style={{
                      background: "#f0f5fb",
                      border: "1px solid #d5e4f2",
                      color: "#3a5a82",
                    }}
                  >
                    <p className="font-medium">Prior vet records help</p>
                    <p className="mt-1 text-xs" style={{ color: "#4d7cb5" }}>
                      Upload a PDF from a recent visit so I can factor in labs,
                      vaccines, and medications.
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5"
                    style={{ border: "1px solid #e6e5e0", borderRadius: "13px", background: "#fff" }}
                  >
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="shrink-0 px-3"
                      title="Attach Photo"
                      aria-label="Attach photo"
                    >
                      <ImagePlus className="w-5 h-5" style={{ color: "#6f7069" }} />
                    </Button>
                    <SpeechInputButton
                      disabled={loading || awaitingAsyncResult}
                      onTranscript={appendTranscriptToInput}
                    />
                    <VetRecordIntakeButton
                      disabled={loading || awaitingAsyncResult}
                      petId={activePet?.id ?? null}
                      onContext={appendVetRecordContextToInput}
                    />
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
                          ? `Describe what's going on with ${displayPetName} or attach a photo...`
                          : "Type your answer or attach a photo..."
                      }
                      rows={2}
                      className="min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-0"
                      style={{ color: "#1d1d1b" }}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => sendMessage()}
                      disabled={(!input.trim() && !selectedImage) || loading || awaitingAsyncResult}
                      className="flex h-[42px] w-full items-center justify-center rounded-full text-white transition-opacity disabled:opacity-50 sm:h-full sm:w-[42px]"
                      style={{ background: "linear-gradient(180deg,#17a06d,#0a7048)" }}
                      aria-label="Send message"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Generate Report button */}
                {readyForReport && !generatingReport && (
                  <div className="mt-3 flex justify-center">
                    <button
                      onClick={() => generateReport()}
                      className={`flex w-full items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-all sm:w-auto ${
                        conversationState === "escalation" ? "animate-pulse" : ""
                      }`}
                      style={{
                        background:
                          conversationState === "escalation"
                            ? "#cf4338"
                            : "linear-gradient(180deg,#17a06d,#0a7048)",
                      }}
                    >
                      {conversationState === "escalation" ? (
                        <>
                          <AlertCircle className="w-4 h-4" />
                          Generate Emergency Vet Summary
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Generate Vet Handoff Summary
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {!sessionStarted && !report && (
          <div className="p-3" style={{ background: "#fff", border: "1px solid #ebeae5", borderRadius: "16px" }}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5"
                style={{ border: "1px solid #e6e5e0", borderRadius: "13px", background: "#fff" }}
              >
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 px-3"
                  title="Attach Photo"
                  aria-label="Attach photo"
                >
                  <ImagePlus className="w-5 h-5" style={{ color: "#9a9b93" }} />
                </Button>
                <SpeechInputButton
                  disabled={loading || awaitingAsyncResult}
                  onTranscript={appendTranscriptToInput}
                />
                <VetRecordIntakeButton
                  disabled={loading || awaitingAsyncResult}
                  petId={activePet?.id ?? null}
                  onContext={appendVetRecordContextToInput}
                />
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
                  placeholder={`Describe what's going on with ${displayPetName} or attach a photo...`}
                  rows={2}
                  className="min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-0"
                  style={{ color: "#1d1d1b" }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => sendMessage()}
                  disabled={(!input.trim() && !selectedImage) || loading || awaitingAsyncResult}
                  className="flex h-[42px] w-full items-center justify-center rounded-full text-white transition-opacity disabled:opacity-50 sm:h-full sm:w-[42px]"
                  style={{ background: "linear-gradient(180deg,#17a06d,#0a7048)" }}
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
            {selectedImage && (
              <div className="mt-3 relative inline-block">
                <img
                  src={selectedImage}
                  alt="Preview"
                  className="h-24 rounded object-contain"
                  style={{ border: "1px solid #ebeae5", background: "#f5f5f7" }}
                />
                <button
                  onClick={clearComposerImage}
                  className="absolute -top-2 -right-2 rounded-full p-1 text-white shadow-sm"
                  style={{ background: "#cf4338" }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Generating Report Loading State */}
        {generatingReport && (
          <Card
            className="animate-pulse p-8 text-center"
            style={{ border: "1px solid #ebeae5", borderRadius: "16px" }}
          >
            <Stethoscope className="mx-auto mb-4 h-12 w-12" style={{ color: "#0b7a4d" }} />
            <h3 className="text-lg font-semibold" style={{ color: "#1d1d1b" }}>
              Preparing Vet Handoff Summary...
            </h3>
            <p className="mt-2 text-sm" style={{ color: "#6f7069" }}>
              Reviewing the conversation, organizing the symptom timeline, and
              preparing urgency guidance plus notes to share with your
              veterinarian...
            </p>
          </Card>
        )}

        {/* Full Report */}
        {report && (
          <div ref={reportRef} className="scroll-mt-4">
            <div className="space-y-4">
              {reportPersistenceMessage ? (
                <Card
                  className="p-4"
                  style={{ background: "#fdf3e3", border: "1px solid #f3e2c2", borderRadius: "14px" }}
                >
                  <p className="text-sm font-semibold" style={{ color: "#b5740a" }}>
                    Report save status
                  </p>
                  <p className="mt-1 text-sm leading-6" style={{ color: "#b5740a" }}>
                    {reportPersistenceMessage}
                  </p>
                </Card>
              ) : null}
              <FullReport report={report} />

              {/* Hand-holding: tell first-time owners what to do after a report. */}
              <Card
                className="p-5"
                style={{ background: "#e9f6ef", border: "1px solid #cfe6da", borderRadius: "14px" }}
              >
                <h3 className="text-base font-semibold" style={{ color: "#1d1d1b" }}>
                  What&apos;s next for {displayPetName}?
                </h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "#6f7069" }}>
                  Your report is saved in History. Keeping a daily check-in helps PawVital
                  spot whether {displayPetName} is getting better or worse over time.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <a
                    href="/health-log"
                    target="_top"
                    className={`${buttonClassName()} w-full sm:w-auto`}
                  >
                    Log today&apos;s check-in
                  </a>
                  <a
                    href="/analytics"
                    target="_top"
                    className={`${buttonClassName({ variant: "outline" })} w-full sm:w-auto`}
                  >
                    See {displayPetName}&apos;s Health Signals
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full sm:w-auto"
                    onClick={startNewSession}
                  >
                    Start another check
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        )}
          </div>
          <SymptomRemembersPanel petId={activePet?.id ?? null} />
        </div>
      </div>
    </TesterOnboardingGate>
  );
}
