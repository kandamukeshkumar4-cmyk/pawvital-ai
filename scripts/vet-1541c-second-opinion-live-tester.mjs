#!/usr/bin/env node
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import helperModule from "./vet-1541c-second-opinion-live-tester-helpers.cjs";

const {
  REQUIRED_OWNER_TURNS,
  buildChecklistResult,
  buildHelpText,
  formatChecklistResult,
  formatDryRunSummary,
  getDryRunSummary,
  isCoughTypePrompt,
  parseArgs,
  redactSensitive,
  scanVisibleTextForLeakage,
  selectSafeFollowUpAnswer,
} = helperModule;

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

class SafeRunError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SafeRunError";
    this.code = code;
  }
}

function resolveWindowsChromeExecutable() {
  if (process.platform !== "win32") {
    return null;
  }

  const candidates = [
    path.join(
      process.env.ProgramFiles || "",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe"
    ),
    path.join(
      process.env["ProgramFiles(x86)"] || "",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe"
    ),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function appUrl(baseUrl, pathname) {
  return new URL(pathname, `${baseUrl}/`).toString();
}

async function writeJsonOutput(outputPath, payload) {
  if (!outputPath) return;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function waitForQuietUi(page, timeoutMs) {
  await page
    .getByText("Thinking...", { exact: true })
    .waitFor({ state: "hidden", timeout: timeoutMs })
    .catch(() => {});
  await page
    .getByText("Preparing Vet Handoff Summary...", { exact: true })
    .waitFor({ state: "hidden", timeout: timeoutMs })
    .catch(() => {});
}

async function bodyText(page) {
  return page.locator("body").innerText({ timeout: 5_000 });
}

async function latestAssistantText(page) {
  const text = await page.evaluate(() => {
    const paragraphs = Array.from(
      document.querySelectorAll("p.whitespace-pre-wrap")
    );
    const assistantTexts = paragraphs
      .map((node) => {
        const parent = node.parentElement;
        const className = parent?.getAttribute("class") || "";
        return {
          className,
          text: node.textContent || "",
        };
      })
      .filter((entry) => !entry.className.includes("bg-blue-600"))
      .map((entry) => entry.text.trim())
      .filter(Boolean);

    return assistantTexts.at(-1) || document.body.innerText || "";
  });

  return text.trim();
}

async function isLoginSurface(page) {
  const currentUrl = page.url();
  if (/\/login(?:\?|$)|reason=(?:session_expired|access_required)/i.test(currentUrl)) {
    return true;
  }

  const emailInputs = await page.locator('input[type="email"]').count();
  const passwordInputs = await page.locator('input[type="password"]').count();
  if (emailInputs > 0 || passwordInputs > 0) {
    return true;
  }

  return (
    (await page.getByRole("button", { name: /log in|sign in/i }).count()) > 0
  );
}

async function assertAuthenticated(page, options) {
  await page.goto(appUrl(options.baseUrl, "/symptom-checker"), {
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  if (await isLoginSurface(page)) {
    throw new SafeRunError(
      "not_authenticated",
      "Browser session is not authenticated or is not allowlisted; refusing to collect credentials."
    );
  }

  await page
    .getByRole("heading", { name: /Dog Symptom Checker/i })
    .waitFor({ timeout: options.timeoutMs });

  if (await isLoginSurface(page)) {
    throw new SafeRunError(
      "not_authenticated",
      "Browser session became unauthenticated after loading the symptom checker."
    );
  }
}

async function acknowledgeTesterBoundaryIfVisible(page, timeoutMs) {
  const boundary = page.getByText(/Before you use PawVital/i).first();
  if (!(await boundary.isVisible().catch(() => false))) {
    return false;
  }

  const checkbox = page.getByRole("checkbox").first();
  if (await checkbox.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await checkbox.check({ timeout: timeoutMs });
  }

  await page
    .getByRole("button", { name: /Acknowledge and continue/i })
    .click({ timeout: timeoutMs });
  await page
    .getByText(/Tell me what's going on with/i)
    .waitFor({ timeout: timeoutMs });
  return true;
}

async function assertSavedDogProfile(page, timeoutMs) {
  await page
    .getByText(/Tell me what's going on with/i)
    .waitFor({ timeout: timeoutMs });

  const addDogVisible =
    (await page.getByText(/Add a dog/i).count()) > 0 ||
    (await page.getByText(/Add your dog/i).count()) > 0;
  if (addDogVisible) {
    throw new SafeRunError(
      "missing_saved_dog_profile",
      "No saved dog profile is visible in the authenticated UI."
    );
  }

  const prompt = await page
    .getByText(/Tell me what's going on with/i)
    .first()
    .innerText({ timeout: timeoutMs });

  if (/with your dog\b/i.test(prompt)) {
    throw new SafeRunError(
      "missing_saved_dog_profile",
      "The symptom checker is using the generic dog fallback instead of a saved dog profile."
    );
  }
}

async function sendUiTurn(page, text, options) {
  const input = page.locator("textarea").last();
  await input.waitFor({ state: "visible", timeout: options.timeoutMs });
  await input.focus();
  await input.fill("");
  await input.pressSequentially(text, { delay: 5 });

  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes("/api/ai/symptom-chat") &&
        response.request().method() === "POST",
      { timeout: options.timeoutMs }
    )
    .catch(() => null);

  await page
    .getByRole("button", { name: "Send message" })
    .click({ timeout: options.timeoutMs });
  await responsePromise;
  await waitForQuietUi(page, options.timeoutMs);
}

async function clickReportButtonIfVisible(page, timeoutMs) {
  const reportButton = page.getByRole("button", {
    name: /Generate (?:Emergency )?Vet (?:Handoff )?Summary/i,
  });
  if (!(await reportButton.first().isVisible().catch(() => false))) {
    return false;
  }

  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes("/api/ai/symptom-chat") &&
        response.request().method() === "POST",
      { timeout: timeoutMs }
    )
    .catch(() => null);
  await reportButton.first().click({ timeout: timeoutMs });
  await responsePromise;
  await waitForQuietUi(page, timeoutMs);
  return true;
}

async function waitForFinalReport(page, timeoutMs) {
  const reportHeading = page.getByText(/What this result means for your dog right now/i);
  await reportHeading.waitFor({ timeout: timeoutMs });
}

async function scanHistoryReport(page, options) {
  await page.goto(appUrl(options.baseUrl, "/history"), {
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  if (await isLoginSurface(page)) {
    throw new SafeRunError(
      "history_not_authenticated",
      "History redirected to login during owner-visible leakage scan."
    );
  }

  await page
    .getByRole("heading", { name: /Symptom Check History/i })
    .waitFor({ timeout: options.timeoutMs });

  const viewFullReport = page.getByRole("button", { name: /View Full Report/i });
  if (!(await viewFullReport.first().isVisible().catch(() => false))) {
    return {
      scanned: false,
      findings: [],
      note: "History page loaded, but no visible saved report row was available to expand.",
    };
  }

  await viewFullReport.first().click({ timeout: options.timeoutMs });
  await page
    .getByText(/What this result means for your dog right now/i)
    .first()
    .waitFor({ timeout: options.timeoutMs })
    .catch(() => {});

  return {
    scanned: true,
    findings: scanVisibleTextForLeakage(await bodyText(page)),
    note: null,
  };
}

async function launchBrowserContext(options) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    throw new SafeRunError(
      "playwright_missing",
      "Playwright is not installed. Run npm install before live browser execution."
    );
  }

  const executablePath =
    options.executablePath || resolveWindowsChromeExecutable() || undefined;
  const launchOptions = {
    headless: options.headless,
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: false,
    args: ["--disable-dev-shm-usage"],
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  const context = await playwright.chromium.launchPersistentContext(
    options.userDataDir,
    launchOptions
  );
  return context;
}

async function runLive(options) {
  const context = await launchBrowserContext(options);
  const page = context.pages()[0] || (await context.newPage());
  const turnsCompleted = [];
  const notes = [];
  let authenticated = false;
  let savedDogProfile = false;
  let requiredCoughFlowCompleted = false;
  let finalReportFound = false;
  let historyReportScanned = false;
  let leakageFindings = [];

  try {
    await assertAuthenticated(page, options);
    authenticated = true;

    const acknowledged = await acknowledgeTesterBoundaryIfVisible(
      page,
      options.timeoutMs
    );
    if (acknowledged) {
      notes.push("Tester boundary acknowledged in the browser profile.");
    }

    await assertSavedDogProfile(page, options.timeoutMs);
    savedDogProfile = true;

    await sendUiTurn(page, REQUIRED_OWNER_TURNS[0].text, options);
    turnsCompleted.push(REQUIRED_OWNER_TURNS[0].phase);

    const firstQuestion = await latestAssistantText(page);
    if (!isCoughTypePrompt(firstQuestion)) {
      throw new SafeRunError(
        "unexpected_first_question",
        "The first follow-up was not the expected cough-type prompt."
      );
    }

    await sendUiTurn(page, REQUIRED_OWNER_TURNS[1].text, options);
    turnsCompleted.push(REQUIRED_OWNER_TURNS[1].phase);
    requiredCoughFlowCompleted = true;

    for (let turn = 0; turn < options.maxTurns; turn += 1) {
      await clickReportButtonIfVisible(page, options.timeoutMs);

      if (
        await page
          .getByText(/What this result means for your dog right now/i)
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        break;
      }

      const visibleText = await bodyText(page);
      if (/may be having a medical emergency|emergency veterinary hospital/i.test(visibleText)) {
        throw new SafeRunError(
          "emergency_path",
          "The UI entered an emergency path; stopping before collecting non-target evidence."
        );
      }

      const question = await latestAssistantText(page);
      const answer = selectSafeFollowUpAnswer(question);
      if (!answer) {
        throw new SafeRunError(
          "no_safe_answer",
          "No safe follow-up answer was available for the latest UI question."
        );
      }

      await sendUiTurn(page, answer.text, options);
      turnsCompleted.push(answer.id);
    }

    await clickReportButtonIfVisible(page, options.timeoutMs);
    await waitForFinalReport(page, options.timeoutMs);
    finalReportFound = true;

    const reportFindings = scanVisibleTextForLeakage(await bodyText(page)).map(
      (finding) => ({
        ...finding,
        surface: "final_report",
      })
    );
    leakageFindings = leakageFindings.concat(reportFindings);

    const historyScan = await scanHistoryReport(page, options);
    historyReportScanned = historyScan.scanned;
    if (historyScan.note) {
      notes.push(historyScan.note);
    }
    leakageFindings = leakageFindings.concat(
      historyScan.findings.map((finding) => ({
        ...finding,
        surface: "history",
      }))
    );
  } catch (error) {
    notes.push(
      error instanceof SafeRunError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error)
    );
  } finally {
    await context.close().catch(() => {});
  }

  return buildChecklistResult({
    authenticated,
    savedDogProfile,
    requiredCoughFlowCompleted,
    finalReportFound,
    historyReportScanned,
    leakageFindings,
    turnsCompleted,
    notes,
  });
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(redactSensitive(error instanceof Error ? error.message : String(error)));
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(buildHelpText());
    return;
  }

  if (options.dryRun) {
    const summary = getDryRunSummary(options);
    await writeJsonOutput(options.output, summary);
    console.log(options.json ? JSON.stringify(summary, null, 2) : formatDryRunSummary(summary));
    return;
  }

  let result;
  try {
    result = await runLive(options);
  } catch (error) {
    result = buildChecklistResult({
      authenticated: false,
      savedDogProfile: false,
      requiredCoughFlowCompleted: false,
      finalReportFound: false,
      historyReportScanned: false,
      leakageFindings: [],
      turnsCompleted: [],
      notes: [
        error instanceof SafeRunError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error),
      ],
    });
  }

  await writeJsonOutput(options.output, result);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatChecklistResult(result));
  process.exitCode = result.overallStatus === "pass" ? 0 : 1;
}

if (isMain) {
  main().catch((error) => {
    console.error(redactSensitive(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}

export { runLive };
