import { NextResponse } from "next/server";
import { runServiceBusWorkerOnce } from "@/lib/azure/service-bus-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: NO_STORE_HEADERS,
    status,
  });
}

function normalizeConfiguredSecret(value: string): string {
  return value.replace(/(?:\\r\\n|\\n|\\r)+$/g, "").trim();
}

function getWorkerSecret(): string {
  return (
    process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() ||
    process.env.HF_SIDECAR_API_KEY?.trim() ||
    ""
  );
}

function isAuthorized(request: Request): boolean {
  const configuredSecret = getWorkerSecret();
  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const acceptedSecrets = new Set(
    [configuredSecret, normalizeConfiguredSecret(configuredSecret)]
      .map((value) => value.trim())
      .filter(Boolean),
  );

  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const directSecret =
    request.headers.get("x-service-bus-worker-secret")?.trim() || "";

  return acceptedSecrets.has(bearerToken) || acceptedSecrets.has(directSecret);
}

function statusForWorkerResult(
  result: Awaited<ReturnType<typeof runServiceBusWorkerOnce>>,
): number {
  if (result.ok) {
    return 200;
  }

  if (result.reason === "invalid_message") {
    return 400;
  }
  if (result.reason === "handler_failed") {
    return 500;
  }
  return 503;
}

async function runWorker(request: Request) {
  if (!isAuthorized(request)) {
    return jsonNoStore({ error: "Unauthorized" }, 401);
  }

  const result = await runServiceBusWorkerOnce();
  return jsonNoStore(result, statusForWorkerResult(result));
}

export async function GET(request: Request) {
  return runWorker(request);
}

export async function POST(request: Request) {
  return runWorker(request);
}
