import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("synthetic latency scripts", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (tempDir) {
        rmSync(tempDir, { force: true, recursive: true });
      }
    }
  });

  function makeTempRoot(): string {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "pawvital-latency-"));
    tempDirs.push(tempRoot);
    return tempRoot;
  }

  it("writes a dry-run probe artifact with the 10s default threshold", () => {
    const tempRoot = makeTempRoot();
    const latestPath = path.join(tempRoot, "latest.json");
    const jsonlPath = path.join(tempRoot, "probe.jsonl");

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), "scripts", "synthetic-prod-probe.mjs"),
        "--dry-run",
        "--output",
        latestPath,
        "--jsonl",
        jsonlPath,
      ],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(0);
    const latest = JSON.parse(readFileSync(latestPath, "utf8"));
    expect(latest.ok).toBe(true);
    expect(latest.maxLatencyMs).toBe(10_000);
  });

  it("builds a passing scorecard from probe JSONL", () => {
    const tempRoot = makeTempRoot();
    const latestPath = path.join(tempRoot, "latest.json");
    const jsonlPath = path.join(tempRoot, "probe.jsonl");
    const scorecardPath = path.join(tempRoot, "scorecard.md");
    const scorecardJsonPath = path.join(tempRoot, "scorecard.json");

    spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), "scripts", "synthetic-prod-probe.mjs"),
        "--dry-run",
        "--output",
        latestPath,
        "--jsonl",
        jsonlPath,
      ],
      { encoding: "utf8" }
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), "scripts", "synthetic-latency-scorecard.mjs"),
        "--input",
        jsonlPath,
        "--output",
        scorecardPath,
        "--json",
        scorecardJsonPath,
        "--min-samples",
        "1",
      ],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(0);
    const scorecard = JSON.parse(readFileSync(scorecardJsonPath, "utf8"));
    expect(scorecard.status).toBe("passed");
    expect(readFileSync(scorecardPath, "utf8")).toContain(
      "PawVital Production Latency Scorecard"
    );
  });

  it("fails the scorecard and renders recent failures when a probe is unhealthy", () => {
    const tempRoot = makeTempRoot();
    const jsonlPath = path.join(tempRoot, "probe.jsonl");
    const scorecardPath = path.join(tempRoot, "scorecard.md");
    const scorecardJsonPath = path.join(tempRoot, "scorecard.json");
    writeFileSync(
      jsonlPath,
      `${JSON.stringify({
        checkedAt: new Date().toISOString(),
        latencyMs: 12_345,
        maxLatencyMs: 10_000,
        ok: false,
        response: { responseType: "probe_error" },
        status: 504,
      })}\n`
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), "scripts", "synthetic-latency-scorecard.mjs"),
        "--input",
        jsonlPath,
        "--output",
        scorecardPath,
        "--json",
        scorecardJsonPath,
        "--min-samples",
        "1",
      ],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    const scorecard = JSON.parse(readFileSync(scorecardJsonPath, "utf8"));
    expect(scorecard.status).toBe("failed");
    expect(scorecard.failureCount).toBe(1);
    const markdown = readFileSync(scorecardPath, "utf8");
    expect(markdown).toContain("## Recent Failures");
    expect(markdown).toContain("response=probe_error");
  });
});
