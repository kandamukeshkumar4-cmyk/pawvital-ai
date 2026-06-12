import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_SYMPTOM_CHAT_TURN_DEPTH,
  getSymptomChatTurnDepth,
} from "@/lib/symptom-chat/question-response-flow";

const originalSymptomChatTurnDepth = process.env.SYMPTOM_CHAT_TURN_DEPTH;

describe("symptom chat turn-depth config", () => {
  beforeEach(() => {
    delete process.env.SYMPTOM_CHAT_TURN_DEPTH;
  });

  afterEach(() => {
    if (originalSymptomChatTurnDepth === undefined) {
      delete process.env.SYMPTOM_CHAT_TURN_DEPTH;
    } else {
      process.env.SYMPTOM_CHAT_TURN_DEPTH = originalSymptomChatTurnDepth;
    }
  });

  it("defaults to standard and rejects unknown values", () => {
    expect(DEFAULT_SYMPTOM_CHAT_TURN_DEPTH).toBe("standard");
    expect(getSymptomChatTurnDepth(undefined)).toBe("standard");
    expect(getSymptomChatTurnDepth("")).toBe("standard");
    expect(getSymptomChatTurnDepth("invalid")).toBe("standard");
    expect(getSymptomChatTurnDepth("lean")).toBe("lean");
    expect(getSymptomChatTurnDepth("DEEP")).toBe("deep");
  });

  it("passes the repository turn-depth guard", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-symptom-turn-depth-config.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "SYMPTOM_CHAT_TURN_DEPTH=standard"
    );
  });

  it("fails the guard when the env template drifts", () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "pawvital-turn-depth-")
    );
    try {
      fs.cpSync(".env.example", path.join(tmpRoot, ".env.example"));
      fs.cpSync("vercel.json", path.join(tmpRoot, "vercel.json"));
      fs.mkdirSync(path.join(tmpRoot, "src/lib/symptom-chat"), {
        recursive: true,
      });
      fs.copyFileSync(
        "src/lib/symptom-chat/question-response-flow.ts",
        path.join(tmpRoot, "src/lib/symptom-chat/question-response-flow.ts")
      );
      fs.copyFileSync("package.json", path.join(tmpRoot, "package.json"));
      fs.mkdirSync(path.join(tmpRoot, "scripts"), { recursive: true });
      fs.copyFileSync(
        "scripts/check-symptom-turn-depth-config.mjs",
        path.join(tmpRoot, "scripts/check-symptom-turn-depth-config.mjs")
      );

      fs.writeFileSync(
        path.join(tmpRoot, ".env.example"),
        fs
          .readFileSync(path.join(tmpRoot, ".env.example"), "utf8")
          .replace(
            "SYMPTOM_CHAT_TURN_DEPTH=standard",
            "SYMPTOM_CHAT_TURN_DEPTH=lean"
          )
      );

      const result = spawnSync(
        process.execPath,
        ["scripts/check-symptom-turn-depth-config.mjs", "--root", tmpRoot],
        {
          cwd: tmpRoot,
          encoding: "utf8",
        }
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        ".env.example must set SYMPTOM_CHAT_TURN_DEPTH=standard"
      );
    } finally {
      fs.rmSync(tmpRoot, { force: true, recursive: true });
    }
  });
});
