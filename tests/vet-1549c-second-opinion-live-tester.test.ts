import helperModule from "../scripts/vet-1541c-second-opinion-live-tester-helpers.cjs";

const helper = helperModule as {
  FORBIDDEN_OWNER_PHRASES: string[];
  REQUIRED_OWNER_TURNS: Array<{ text: string }>;
  SAFE_FOLLOW_UP_ANSWERS: Array<{ id: string; text: string }>;
  buildChecklistResult(input: Record<string, unknown>): {
    overallStatus: string;
    checks: Record<string, boolean>;
    leakageFindings: Array<{ marker: string; occurrences: number }>;
  };
  formatChecklistResult(result: Record<string, unknown>): string;
  getDryRunSummary(options: Record<string, unknown>): Record<string, unknown>;
  isCoughTypePrompt(text: string): boolean;
  parseArgs(argv: string[], env?: Record<string, string | undefined>): {
    baseUrl: string;
    dryRun: boolean;
    headless: boolean;
    json: boolean;
    maxTurns: number;
    userDataDir: string;
  };
  redactSensitive(value: string): string;
  scanVisibleTextForLeakage(
    text: string
  ): Array<{ marker: string; occurrences: number }>;
  selectSafeFollowUpAnswer(questionText: string):
    | { id: string; text: string }
    | undefined;
};

describe("VET-1549C second-opinion live tester helpers", () => {
  it("parses safe dry-run options without accepting credential flags", () => {
    const parsed = helper.parseArgs(
      [
        "--dry-run",
        "--json",
        "--headless",
        "--base-url",
        "https://pawvital-ai.vercel.app/",
        "--max-turns",
        "4",
        "--user-data-dir",
        "C:/tmp/pawvital-profile",
      ],
      { LOCALAPPDATA: "C:/tmp" }
    );

    expect(parsed).toMatchObject({
      baseUrl: "https://pawvital-ai.vercel.app",
      dryRun: true,
      headless: true,
      json: true,
      maxTurns: 4,
    });
    expect(parsed.userDataDir).toContain("pawvital-profile");
    expect(() => helper.parseArgs(["--password", "value"])).toThrow(
      /Unknown option/
    );
  });

  it("keeps the required cough flow exact and avoids known emergency trigger phrases", () => {
    expect(helper.REQUIRED_OWNER_TURNS.map((turn) => turn.text)).toEqual([
      "Coughing",
      "It is a dry honking cough.",
    ]);

    const allOwnerText = [
      ...helper.REQUIRED_OWNER_TURNS.map((turn) => turn.text),
      ...helper.SAFE_FOLLOW_UP_ANSWERS.map((answer) => answer.text),
    ].join("\n");

    for (const phrase of helper.FORBIDDEN_OWNER_PHRASES) {
      expect(allOwnerText.toLowerCase()).not.toContain(phrase);
    }
  });

  it("selects the exact cough-type gate and safe follow-up answers", () => {
    expect(
      helper.isCoughTypePrompt(
        "What does the cough sound like? Dry/honking, wet/productive, or gagging?"
      )
    ).toBe(true);
    expect(helper.isCoughTypePrompt("How long has the coughing been going on?")).toBe(
      false
    );

    expect(
      helper.selectSafeFollowUpAnswer("How long has the coughing been going on?")
    ).toMatchObject({
      id: "cough_duration",
      text: "It started about two days ago.",
    });
    expect(
      helper.selectSafeFollowUpAnswer(
        "Can you count your dog's breaths for 15 seconds while resting?"
      )
    ).toMatchObject({
      id: "breathing_rate",
    });
    expect(
      helper.selectSafeFollowUpAnswer(
        "Has your dog been exposed to a new household cleaner?"
      )
    ).toBeUndefined();
  });

  it("detects owner-visible second-opinion telemetry markers without returning raw report text", () => {
    const visibleText = [
      "What this result means for your dog right now",
      '{"eligibility_reason":"eligible","owner_note":"private detail"}',
      "shadow_comparison",
      "secondOpinionTrace",
    ].join("\n");

    const findings = helper.scanVisibleTextForLeakage(visibleText);

    expect(findings).toEqual(
      expect.arrayContaining([
        { marker: "eligibility_reason", occurrences: 1 },
        { marker: "shadow_comparison", occurrences: 1 },
        { marker: "secondOpinionTrace", occurrences: 1 },
        { marker: "raw_json_telemetry_block", occurrences: 1 },
      ])
    );
    expect(JSON.stringify(findings)).not.toContain("private detail");
  });

  it("redacts auth material before putting failures into checklist output", () => {
    const redacted = helper.redactSensitive(
      [
        "Cookie: sb-test-auth-token=secret-cookie;",
        "Authorization: Bearer sample-token",
        "https://example.test/callback?access_token=sample-token",
      ].join("\n")
    );

    expect(redacted).toContain("Cookie: [redacted]");
    expect(redacted).toContain("Bearer [redacted]");
    expect(redacted).toContain("access_token=[redacted]");
    expect(redacted).not.toContain("secret-cookie");
    expect(redacted).not.toContain("sample-token");
  });

  it("builds a concise admin checklist result for dry-run and live safety states", () => {
    const dryRun = helper.getDryRunSummary({
      baseUrl: "https://pawvital-ai.vercel.app",
    });
    expect(JSON.stringify(dryRun)).toContain("It is a dry honking cough.");
    expect(JSON.stringify(dryRun)).toContain("secondOpinionTrace");

    const liveResult = helper.buildChecklistResult({
      authenticated: true,
      savedDogProfile: true,
      requiredCoughFlowCompleted: true,
      finalReportFound: true,
      historyReportScanned: false,
      leakageFindings: [],
      turnsCompleted: ["initial complaint"],
      notes: ["Cookie: sb-test-auth-token=secret-cookie"],
    });

    expect(liveResult.overallStatus).toBe("needs_review");
    expect(liveResult.checks.ownerVisibleLeakageFree).toBe(true);

    const formatted = helper.formatChecklistResult(liveResult);
    expect(formatted).toContain("history report scanned: WARN");
    expect(formatted).not.toContain("secret-cookie");

    expect(
      helper.buildChecklistResult({
        authenticated: true,
        savedDogProfile: true,
        requiredCoughFlowCompleted: false,
        finalReportFound: true,
        historyReportScanned: true,
        leakageFindings: [],
      }).overallStatus
    ).toBe("fail");
  });
});
