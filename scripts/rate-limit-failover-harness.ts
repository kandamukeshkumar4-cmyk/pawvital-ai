#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { checkRateLimit } from "../src/lib/rate-limit.ts";

interface HarnessOptions {
  baseUrl: string;
  concurrency: number;
  failoverAttempts: number;
  json: boolean;
  output: string;
  requests: number;
  skipFailover: boolean;
  skipHttp: boolean;
  targetPath: string;
  timeoutMs: number;
  uniqueClients: number;
}

interface HttpSummary {
  failureCount: number;
  passed: boolean;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  statusCounts: Record<string, number>;
  totalRequests: number;
}

interface FailoverSummary {
  attempts: number;
  degradedSuccesses: number;
  passed: boolean;
  sampleResult: Awaited<ReturnType<typeof checkRateLimit>> | null;
}

const rootDir = process.cwd();
const defaultOutputPath = path.join(
  rootDir,
  "tmp",
  "rate-limit-failover-report.json"
);

function parseArgs(argv: string[]): HarnessOptions {
  const options: HarnessOptions = {
    baseUrl:
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000",
    concurrency: Number(process.env.RATE_LIMIT_LOAD_CONCURRENCY || 5),
    failoverAttempts: Number(process.env.RATE_LIMIT_FAILOVER_ATTEMPTS || 3),
    json: false,
    output: defaultOutputPath,
    requests: Number(process.env.RATE_LIMIT_LOAD_REQUESTS || 30),
    skipFailover: false,
    skipHttp: false,
    targetPath:
      process.env.RATE_LIMIT_LOAD_TARGET ||
      "/api/breeds/risk?breed=golden%20retriever&top=5",
    timeoutMs: Number(process.env.RATE_LIMIT_LOAD_TIMEOUT_MS || 5_000),
    uniqueClients: Number(process.env.RATE_LIMIT_LOAD_CLIENTS || 10),
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--skip-http") {
      options.skipHttp = true;
    } else if (arg === "--skip-failover") {
      options.skipFailover = true;
    } else if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length).trim();
    } else if (arg.startsWith("--target-path=")) {
      options.targetPath = arg.slice("--target-path=".length).trim();
    } else if (arg.startsWith("--requests=")) {
      options.requests = Number(arg.slice("--requests=".length));
    } else if (arg.startsWith("--concurrency=")) {
      options.concurrency = Number(arg.slice("--concurrency=".length));
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else if (arg.startsWith("--unique-clients=")) {
      options.uniqueClients = Number(arg.slice("--unique-clients=".length));
    } else if (arg.startsWith("--failover-attempts=")) {
      options.failoverAttempts = Number(arg.slice("--failover-attempts=".length));
    } else if (arg.startsWith("--output=")) {
      options.output = path.resolve(rootDir, arg.slice("--output=".length));
    }
  }

  return options;
}

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)
  );
  return sorted[index] ?? null;
}

function buildTargetUrl(baseUrl: string, targetPath: string): string {
  const url = new URL(baseUrl);
  const resolved = new URL(targetPath, url);
  return resolved.toString();
}

async function runHttpLoadProbe(options: HarnessOptions): Promise<HttpSummary> {
  const requestUrl = buildTargetUrl(options.baseUrl, options.targetPath);
  const latencies: number[] = [];
  const statusCounts = new Map<number, number>();
  let failureCount = 0;
  let nextRequestIndex = 0;

  const worker = async () => {
    while (true) {
      const requestIndex = nextRequestIndex;
      nextRequestIndex += 1;
      if (requestIndex >= options.requests) {
        return;
      }

      const clientIndex = requestIndex % Math.max(1, options.uniqueClients);
      const requestStartedAt = Date.now();

      try {
        const response = await fetch(requestUrl, {
          headers: {
            "x-forwarded-for": `198.51.100.${(clientIndex % 200) + 1}`,
            "x-user-id": `load-client-${clientIndex}`,
          },
          signal: AbortSignal.timeout(options.timeoutMs),
        });

        await response.text();
        latencies.push(Date.now() - requestStartedAt);
        statusCounts.set(
          response.status,
          (statusCounts.get(response.status) ?? 0) + 1
        );
      } catch {
        failureCount += 1;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.max(1, options.concurrency) },
      async () => worker()
    )
  );

  const otherFailures = Array.from(statusCounts.entries()).some(
    ([status]) => status >= 500
  );

  return {
    failureCount,
    passed: failureCount === 0 && !otherFailures,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    p99LatencyMs: percentile(latencies, 0.99),
    statusCounts: Object.fromEntries(
      Array.from(statusCounts.entries()).map(([status, count]) => [
        String(status),
        count,
      ])
    ),
    totalRequests: options.requests,
  };
}

async function runFailoverProbe(
  options: HarnessOptions
): Promise<FailoverSummary> {
  const throwingLimiter = {
    limit: async () => {
      throw new Error("simulated upstash outage");
    },
  };

  const results = [];
  for (let index = 0; index < options.failoverAttempts; index += 1) {
    results.push(
      await checkRateLimit(
        throwingLimiter as never,
        `rate-limit-failover-harness:${index}`
      )
    );
  }

  const degradedSuccesses = results.filter(
    (result) => result.success && result.degraded === true
  ).length;

  return {
    attempts: options.failoverAttempts,
    degradedSuccesses,
    passed:
      degradedSuccesses === options.failoverAttempts &&
      results.every((result) => result.success),
    sampleResult: results[0] ?? null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary: {
    baseUrl: string;
    failover: FailoverSummary | null;
    generatedAt: string;
    http: HttpSummary | null;
    targetPath: string;
  } = {
    baseUrl: options.baseUrl,
    failover: null,
    generatedAt: new Date().toISOString(),
    http: null,
    targetPath: options.targetPath,
  };

  if (!options.skipHttp) {
    summary.http = await runHttpLoadProbe(options);
  }

  if (!options.skipFailover) {
    summary.failover = await runFailoverProbe(options);
  }

  ensureParentDir(options.output);
  fs.writeFileSync(options.output, JSON.stringify(summary, null, 2));

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      `Saved rate-limit harness report to ${options.output}`
    );
  }

  const passedHttp = summary.http?.passed ?? true;
  const passedFailover = summary.failover?.passed ?? true;

  if (!passedHttp || !passedFailover) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
