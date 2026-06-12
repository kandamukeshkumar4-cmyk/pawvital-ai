export interface DeadlineFetchOptions {
  deadlineAtMs?: number;
  timeoutMs?: number;
}

export function createDeadlineExceededError(label = "request"): Error {
  const error = new Error(`${label} deadline exhausted`);
  error.name = "AbortError";
  return error;
}

export function resolveDeadlineTimeoutMs(
  options: DeadlineFetchOptions | undefined,
  defaultTimeoutMs: number,
  nowMs = Date.now()
): number {
  const safeDefaultTimeoutMs = Number.isFinite(defaultTimeoutMs)
    ? Math.max(1, Math.floor(defaultTimeoutMs))
    : 1;
  const requestedTimeoutMs = Number.isFinite(options?.timeoutMs)
    ? Math.max(1, Math.floor(options?.timeoutMs as number))
    : safeDefaultTimeoutMs;
  const baseTimeoutMs = Math.min(safeDefaultTimeoutMs, requestedTimeoutMs);

  if (options?.deadlineAtMs === undefined) {
    return baseTimeoutMs;
  }

  const remainingMs = Math.floor(options.deadlineAtMs - nowMs);
  return Math.max(0, Math.min(baseTimeoutMs, remainingMs));
}

export async function fetchWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit,
  options: DeadlineFetchOptions | undefined,
  defaultTimeoutMs: number,
  label = "request"
): Promise<Response> {
  const timeoutMs = resolveDeadlineTimeoutMs(options, defaultTimeoutMs);
  if (timeoutMs <= 0) {
    throw createDeadlineExceededError(label);
  }

  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort();
  if (upstreamSignal?.aborted) {
    throw createDeadlineExceededError(label);
  }
  upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}
