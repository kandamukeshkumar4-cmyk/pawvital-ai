import { afterEach, describe, expect, it } from "@jest/globals";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import path from "node:path";

describe("rate-limit failover harness", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (!server) {
      return;
    }

    server.close();
    await once(server, "close");
    server = null;
  });

  it("proves symptom-chat throttling against a single client", async () => {
    const counts = new Map<string, number>();
    const seenPaths: string[] = [];

    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }

      const clientId = String(req.headers["x-user-id"] ?? "missing-client");
      seenPaths.push(String(req.url ?? ""));
      counts.set(clientId, (counts.get(clientId) ?? 0) + 1);

      if (req.method !== "POST" || req.url !== "/api/ai/symptom-chat") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }

      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      expect(body.action).toBe("chat");
      expect(body.messages?.[0]?.content).toContain("limping");

      if ((counts.get(clientId) ?? 0) > 2) {
        res.writeHead(429, {
          "content-type": "application/json",
          "retry-after": "60",
        });
        res.end(JSON.stringify({ error: "Too many requests. Please slow down." }));
        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "question", message: "Which leg is affected?" }));
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind test server");
    }

    const repoRoot = path.resolve(__dirname, "..");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const child = spawn(
      process.execPath,
      [
        "scripts/run-rate-limit-failover-harness.cjs",
        `--base-url=${baseUrl}`,
        "--requests=4",
        "--concurrency=1",
        "--unique-clients=1",
        "--skip-failover",
        "--json",
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    const [exitCode] = (await once(child, "close")) as [number];

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);

    const summary = JSON.parse(stdout) as {
      http: {
        passed: boolean;
        passedAllowedCount: number;
        throttledCount: number;
        totalRequests: number;
      } | null;
      targetPath: string;
    };

    expect(summary.targetPath).toBe("/api/ai/symptom-chat");
    expect(summary.http).not.toBeNull();
    expect(summary.http?.passed).toBe(true);
    expect(summary.http?.passedAllowedCount).toBeGreaterThan(0);
    expect(summary.http?.throttledCount).toBeGreaterThan(0);
    expect(summary.http?.totalRequests).toBe(4);
    expect(counts.size).toBe(1);
    expect(Array.from(counts.values())[0]).toBe(4);
    expect(seenPaths).toEqual([
      "/api/ai/symptom-chat",
      "/api/ai/symptom-chat",
      "/api/ai/symptom-chat",
      "/api/ai/symptom-chat",
    ]);
  });
});
