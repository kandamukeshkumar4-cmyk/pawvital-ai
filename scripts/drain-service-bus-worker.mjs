#!/usr/bin/env node
/**
 * Drains the Azure Service Bus queue by repeatedly POSTing the worker route.
 * Each POST processes at most one message, so loop until the queue is empty.
 *
 * Intended trigger options (the worker is pull-based — something must call it):
 *   - Azure Function timer trigger (every 1–2 min) running this script
 *   - A cron job / container sidecar loop
 *   - Manual invocation for local testing
 *
 * Env:
 *   PAWVITAL_PUBLIC_BASE_URL   base URL of the deployed app (default localhost:3000)
 *   ASYNC_REVIEW_WEBHOOK_SECRET (or HF_SIDECAR_API_KEY) worker auth secret
 *   WORKER_DRAIN_MAX_ITERATIONS safety cap per run (default 25)
 */

const BASE_URL = (
  process.env.PAWVITAL_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");
const SECRET =
  process.env.ASYNC_REVIEW_WEBHOOK_SECRET || process.env.HF_SIDECAR_API_KEY || "";
const MAX_ITERATIONS = Number(process.env.WORKER_DRAIN_MAX_ITERATIONS || 25);

async function drainOnce() {
  const response = await fetch(`${BASE_URL}/api/azure/service-bus/worker`, {
    method: "POST",
    headers: SECRET ? { authorization: `Bearer ${SECRET}` } : {},
  });
  const body = await response.json().catch(() => ({}));
  return { body, status: response.status };
}

async function main() {
  let processed = 0;
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const { body, status } = await drainOnce();

    if (status !== 200) {
      console.error(
        `Worker returned ${status}: ${body.reason || body.error || "unknown"}`
      );
      process.exitCode = status >= 500 ? 1 : 0;
      return;
    }

    if (!body.processed) {
      // 200 + processed:false → no_messages → queue is drained.
      console.log(`Queue drained. Processed ${processed} job(s) this run.`);
      return;
    }

    processed += 1;
    console.log(`Processed ${body.jobType} (${body.messageId}).`);
  }

  console.log(
    `Hit max iterations (${MAX_ITERATIONS}); processed ${processed}. More may remain.`
  );
}

main().catch((error) => {
  console.error("drain-service-bus-worker failed:", error);
  process.exit(1);
});
