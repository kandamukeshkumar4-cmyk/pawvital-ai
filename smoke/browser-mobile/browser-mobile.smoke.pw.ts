import { expect, test, type Page } from "@playwright/test";

const DEMO_PETS_STORAGE_KEY = "pawvital_demo_pets";
const PET_ONBOARDING_DISMISSED_KEY = "pawvital_pet_onboarding_dismissed";
const SMOKE_SEED_STORAGE_KEY = "pawvital_browser_mobile_smoke_seeded";
const TESTER_CONSENT_STORAGE_KEY = "pawvital_tester_acknowledgements";
const TESTER_CONSENT_VERSION = "2026-04-private-tester-rc-v1";

const DEMO_DOG = {
  age_months: 0,
  age_years: 4,
  breed: "Golden Retriever",
  existing_conditions: [],
  id: "dog-1",
  name: "Buddy",
  species: "dog",
  user_id: "demo-user",
  weight: 55,
};

function buildEmergencyReport() {
  return {
    severity: "emergency" as const,
    recommendation: "emergency_vet" as const,
    title: "Emergency vet handoff summary",
    explanation:
      "Generated from the browser/mobile smoke runner with an emergency recommendation.",
    actions: [
      "Leave now for the nearest emergency veterinary hospital.",
      "Keep Buddy as calm and still as possible on the way.",
    ],
    warning_signs: ["Collapse", "Pale gums", "Trouble breathing"],
    vet_handoff_summary:
      "Buddy collapsed and has pale gums. Emergency evaluation is needed now.",
    report_storage_id: "smoke-emergency-report",
    outcome_feedback_enabled: true,
  };
}

function buildMildReport() {
  return {
    severity: "medium" as const,
    recommendation: "vet_48h" as const,
    title: "Itching follow-up summary",
    explanation:
      "Generated from the browser/mobile smoke runner without demo fallback copy.",
    actions: [
      "Monitor the itching and schedule a veterinary visit within 48 hours if it persists.",
      "Prevent additional skin irritation and note any new symptoms.",
    ],
    warning_signs: ["Facial swelling", "Trouble breathing", "Open sores"],
    vet_handoff_summary:
      "Buddy has mild itching but is still eating normally. Follow-up guidance is non-emergency.",
    report_storage_id: "smoke-mild-report",
    outcome_feedback_enabled: true,
  };
}

async function seedDemoState(page: Page, options: { consent: boolean }) {
  await page.addInitScript(
    ({
      consent,
      dog,
      dismissedKey,
      petsKey,
      seedKey,
      storageKey,
      version,
    }) => {
      window.sessionStorage.setItem(petsKey, JSON.stringify([dog]));
      window.sessionStorage.setItem(dismissedKey, "1");

      if (!window.sessionStorage.getItem(seedKey)) {
        if (!consent) {
          window.localStorage.removeItem(storageKey);
        } else {
          const subjectId = "anonymous";
          window.localStorage.setItem(
            storageKey,
            JSON.stringify({
              [subjectId]: {
                acceptedAt: "2026-04-21T00:00:00.000Z",
                subjectId,
                userId: null,
                version,
              },
            })
          );
        }

        window.sessionStorage.setItem(seedKey, "1");
      }
    },
    {
      consent: options.consent,
      dismissedKey: PET_ONBOARDING_DISMISSED_KEY,
      dog: DEMO_DOG,
      petsKey: DEMO_PETS_STORAGE_KEY,
      seedKey: SMOKE_SEED_STORAGE_KEY,
      storageKey: TESTER_CONSENT_STORAGE_KEY,
      version: TESTER_CONSENT_VERSION,
    }
  );
}

async function installEmergencyMocks(page: Page) {
  const feedbackSubmissions: Array<Record<string, unknown>> = [];

  await page.route("**/api/ai/outcome-feedback", async (route) => {
    const payload = JSON.parse(route.request().postData() || "{}") as Record<
      string,
      unknown
    >;
    feedbackSubmissions.push(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        case: {
          flagged: true,
        },
      }),
    });
  });

  await page.route("**/api/ai/symptom-chat", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}") as {
      action?: string;
    };

    if (body.action === "generate_report") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "report",
          report: buildEmergencyReport(),
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "emergency",
        message:
          "Buddy may be having a medical emergency. Please go to the nearest emergency veterinary hospital now.",
        session: {
          answered_questions: {},
          unresolved_question_ids: [],
        },
        conversationState: "escalation",
      }),
    });
  });

  return feedbackSubmissions;
}

async function installMildMocks(page: Page) {
  const feedbackSubmissions: Array<Record<string, unknown>> = [];

  await page.route("**/api/ai/outcome-feedback", async (route) => {
    const payload = JSON.parse(route.request().postData() || "{}") as Record<
      string,
      unknown
    >;
    feedbackSubmissions.push(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        case: {
          flagged: false,
        },
      }),
    });
  });

  await page.route("**/api/ai/symptom-chat", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}") as {
      action?: string;
      messages?: Array<{ content?: string }>;
    };

    if (body.action === "generate_report") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "report",
          report: buildMildReport(),
        }),
      });
      return;
    }

    const latestMessage = body.messages?.at(-1)?.content?.toLowerCase() || "";

    if (latestMessage.includes("mild itching")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "question",
          message:
            "How long has the itching been going on, and is Buddy still eating normally?",
          session: {
            answered_questions: {},
            unresolved_question_ids: ["itching_duration"],
          },
          conversationState: "asking",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "ready",
        message:
          "Thanks. This sounds mild right now, and I can prepare a vet handoff summary.",
        session: {
          answered_questions: {
            itching_duration: "two days",
          },
          unresolved_question_ids: [],
        },
        conversationState: "confirmed",
      }),
    });
  });

  return feedbackSubmissions;
}

test("tester onboarding smoke shows the boundary once and skips it for returning users", async ({
  page,
}) => {
  await seedDemoState(page, { consent: false });
  await page.goto("/symptom-checker");

  await expect(
    page.getByText("Before you use PawVital with Buddy")
  ).toBeVisible();
  await expect(page.getByText("Dog-only", { exact: true })).toBeVisible();
  await expect(
    page.getByText("PawVital gives urgency guidance, not diagnosis or treatment.")
  ).toBeVisible();

  await page.getByRole("checkbox").click();
  await page
    .getByRole("button", { name: "Acknowledge and continue" })
    .click();

  await expect(
    page.getByText("Tell me what's going on with Buddy")
  ).toBeVisible();

  await page.reload();

  await expect(
    page.getByText("Before you use PawVital with Buddy")
  ).toHaveCount(0);
  await expect(
    page.getByText("Tell me what's going on with Buddy")
  ).toBeVisible();
});

test("emergency result-flow smoke shows urgency, opens a non-demo report, and submits feedback", async ({
  page,
}) => {
  const feedbackSubmissions = await installEmergencyMocks(page);
  await seedDemoState(page, { consent: true });
  await page.goto("/symptom-checker");

  await page
    .getByPlaceholder("Describe what's going on with Buddy or attach a photo...")
    .fill("My dog collapsed and has pale gums.");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(
    page.getByText(/Buddy may be having a medical emergency\./i)
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate Emergency Vet Summary" })
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Generate Emergency Vet Summary" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Emergency vet handoff summary" })
  ).toBeVisible();
  await expect(
    page.getByText(/Generated from the browser\/mobile smoke runner/i)
  ).toBeVisible();
  await expect(page.getByText("Private tester feedback")).toBeVisible();

  await page.getByRole("button", { name: "No" }).first().click();
  await page.getByRole("button", { name: "Report" }).click();
  await page.getByRole("button", { name: "Not sure" }).click();
  await page
    .getByLabel("Optional notes")
    .fill("Emergency result-flow smoke submission.");
  await page.getByRole("button", { name: "Send feedback" }).click();

  await expect(
    page.getByText("Saved and flagged for follow-up review.")
  ).toBeVisible();
  expect(feedbackSubmissions).toHaveLength(1);
  expect(feedbackSubmissions[0]).toMatchObject({
    symptomCheckId: "smoke-emergency-report",
    surface: "result_page",
  });
});

test("mild result-flow smoke keeps the question flow understandable and submits feedback", async ({
  page,
}) => {
  const feedbackSubmissions = await installMildMocks(page);
  await seedDemoState(page, { consent: true });
  await page.goto("/symptom-checker");

  await page
    .getByPlaceholder("Describe what's going on with Buddy or attach a photo...")
    .fill("My dog has mild itching but is eating normally.");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(
    page.getByText(
      "How long has the itching been going on, and is Buddy still eating normally?"
    )
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate Emergency Vet Summary" })
  ).toHaveCount(0);

  await page.getByPlaceholder("Type your answer or attach a photo...").fill(
    "About two days. Buddy is still eating and acting normal."
  );
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(
    page.getByRole("heading", { name: "Itching follow-up summary" })
  ).toBeVisible();
  await expect(
    page.getByText(/without demo fallback copy/i)
  ).toBeVisible();
  await expect(page.getByText("Private tester feedback")).toBeVisible();

  await page.getByRole("button", { name: "Somewhat" }).click();
  await page.getByRole("button", { name: "Questions" }).click();
  await page.getByRole("button", { name: "Yes" }).nth(1).click();
  await page
    .getByLabel("Optional notes")
    .fill("Mild question flow remained understandable.");
  await page.getByRole("button", { name: "Send feedback" }).click();

  await expect(
    page.getByText("Saved. Thanks for helping improve PawVital.")
  ).toBeVisible();
  expect(feedbackSubmissions).toHaveLength(1);
  expect(feedbackSubmissions[0]).toMatchObject({
    symptomCheckId: "smoke-mild-report",
    surface: "result_page",
  });
});
