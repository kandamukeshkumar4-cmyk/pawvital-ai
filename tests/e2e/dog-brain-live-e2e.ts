/**
 * Dog Brain live E2E — investor-demo proof harness (Phase 4).
 *
 * Proves the full memory loop against a REAL deployment:
 *   seed 14/60/90-day logs + follow-up + supplement trial
 *     → open the symptom checker
 *     → poll until a memory-driven question appears (brain_question_trace populated)
 *     → assert the emergency path SUPPRESSES the trace
 *     → clean up and prove 0 residual rows
 *     → write screenshots/artifacts
 *
 * SAFETY:
 *   - Env-gated: with required secrets absent it logs SKIP and exits 0 (never
 *     writes anything). Intended to run only from the manual workflow_dispatch
 *     CI job, never automatically on every PR.
 *   - Crash-safe cleanup: every created resource is recorded in a `SeedTracker`
 *     the instant it exists (auth user id captured immediately after createUser,
 *     pet id immediately after insert). The `finally` block cleans up from that
 *     tracker, so a seed that throws halfway — e.g. the pet insert fails AFTER
 *     the auth user was created — still deletes the orphaned auth user. A
 *     residual count is then asserted to be 0; a non-zero residual fails the run.
 *   - It touches whatever project the SUPABASE_SERVICE_ROLE_KEY belongs to —
 *     point it at a sandbox/staging project, never shared prod data.
 *   - The CLI entry (`main()`) is guarded so importing this module for unit
 *     tests never performs any writes.
 *
 * STATUS: authored, NOT yet executed against a live deployment. Selectors for
 *   the login form are resilient (role/type based) but should be validated on
 *   the first operator run; the trace assertions hit the API contract directly
 *   (robust). See docs/dog-brain/INVESTOR_DEMO_HARDENING_STATE.md.
 *
 * Run: SUPABASE_SERVICE_ROLE_KEY=… E2E_BASE_URL=… E2E_SANDBOX_EMAIL=… \
 *      E2E_SANDBOX_PASSWORD=… npx ts-node --esm tests/e2e/dog-brain-live-e2e.ts
 */

import { chromium, type APIRequestContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Records every resource the seed creates, the instant it is created, so the
 * finally-block cleanup can delete partial state even if seed() throws midway.
 */
export interface SeedTracker {
  userId?: string;
  petId?: string;
}

interface SymptomChatResponse {
  type?: string;
  message?: string;
  brain_question_trace?: { evidence_summary?: string } | null;
  // The deterministic engine's state — MUST be threaded back each turn or the
  // conversation restarts and the complaint never exhausts (so no Brain trace).
  session?: unknown;
}

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "dog-brain-e2e");
const SANDBOX_PET_NAME = "E2E Bruno (sandbox)";
const MAX_MEMORY_TURNS = 12;

function requireEnv(): {
  baseUrl: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  email: string;
  password: string;
} | null {
  const baseUrl = process.env.E2E_BASE_URL?.trim();
  const supabaseUrl = (
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const email = process.env.E2E_SANDBOX_EMAIL?.trim();
  const password = process.env.E2E_SANDBOX_PASSWORD?.trim();

  if (!baseUrl || !supabaseUrl || !serviceRoleKey || !email || !password) {
    return null;
  }
  return { baseUrl, supabaseUrl, serviceRoleKey, email, password };
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 90-day storyline: baseline → soft stool → reduced appetite → vomiting today. */
export function buildLogRows(userId: string, petId: string) {
  const rows: Record<string, unknown>[] = [];
  for (let d = 90; d >= 0; d--) {
    let appetite = "normal";
    let stool = "normal";
    let vomiting = 0;
    if (d <= 30 && d > 10) stool = "soft";
    if (d <= 10 && d > 3) {
      stool = "soft";
      appetite = "reduced";
    }
    if (d <= 3) {
      stool = "diarrhea";
      appetite = "reduced";
      vomiting = d === 0 ? 2 : 1;
    }
    rows.push({
      user_id: userId,
      pet_id: petId,
      log_date: isoDaysAgo(d),
      appetite,
      water: "normal",
      stool,
      urination: "normal",
      vomiting_count: vomiting,
      energy: d <= 5 ? "low" : "normal",
      context_signals:
        stool !== "normal"
          ? { gi: { change_note: "softer stool than usual" } }
          : {},
    });
  }
  return rows;
}

export async function seed(
  admin: SupabaseClient,
  email: string,
  password: string,
  tracker: SeedTracker,
): Promise<{ userId: string; petId: string }> {
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !created.user) {
    throw new Error(`seed: createUser failed: ${userErr?.message ?? "no user"}`);
  }
  const userId = created.user.id;
  // Record the auth user IMMEDIATELY — if any later step throws, cleanup must
  // still know this id so the user is never orphaned.
  tracker.userId = userId;

  // profiles row may be created by a trigger; upsert defensively (FK target).
  await admin.from("profiles").upsert({ id: userId }, { onConflict: "id" });

  const { data: pet, error: petErr } = await admin
    .from("pets")
    .insert({ user_id: userId, name: SANDBOX_PET_NAME, species: "dog", breed: "Mixed" })
    .select("id")
    .single();
  if (petErr || !pet) {
    throw new Error(`seed: pet insert failed: ${petErr?.message ?? "no pet"}`);
  }
  const petId = pet.id as string;
  // Record the pet id immediately, before the dependent inserts below.
  tracker.petId = petId;

  const { error: logErr } = await admin
    .from("daily_health_logs")
    .insert(buildLogRows(userId, petId));
  if (logErr) throw new Error(`seed: daily_health_logs insert failed: ${logErr.message}`);

  const { error: fuErr } = await admin.from("dog_brain_followups").insert({
    user_id: userId,
    pet_id: petId,
    signal_key: "stool_change",
    prompt: "It's been a few days since the stool change — better, same, or worse?",
    status: "pending",
    due_at: new Date().toISOString(),
  });
  if (fuErr) throw new Error(`seed: followup insert failed: ${fuErr.message}`);

  const { error: stErr } = await admin.from("dog_brain_supplement_trials").insert({
    user_id: userId,
    pet_id: petId,
    supplement_name: "gut-support (ask vet)",
    reason_signal_key: "stool_change",
    status: "active",
    outcome: "worse",
    started_at: new Date().toISOString(),
  });
  if (stErr) throw new Error(`seed: supplement trial insert failed: ${stErr.message}`);

  return { userId, petId };
}

async function postSymptomChat(
  request: APIRequestContext,
  baseUrl: string,
  petId: string,
  messages: { role: "user" | "assistant"; content: string }[],
  session: unknown,
): Promise<SymptomChatResponse> {
  const res = await request.post(`${baseUrl}/api/ai/symptom-chat`, {
    data: {
      action: "chat", // brain-context load (and thus the trace) is gated on this
      messages,
      pet: { id: petId, name: SANDBOX_PET_NAME, species: "dog", breed: "Mixed" },
      // Thread the prior turn's session so the conversation actually progresses.
      ...(session ? { session } : {}),
    },
    // The symptom-chat turn calls the NIM model and can exceed Playwright's
    // default 30s API timeout on a cold serverless start; give it real headroom.
    timeout: 90_000,
  });
  if (!res.ok()) {
    throw new Error(`symptom-chat HTTP ${res.status()}: ${await res.text()}`);
  }
  return (await res.json()) as SymptomChatResponse;
}

/**
 * Delete whatever the tracker says was created — tolerant of partial seeds. Safe
 * to call with only a userId (pet insert never happened), only a petId, or both.
 * Proves 0 residual for every id that exists. Never throws on a missing id.
 */
export async function cleanup(
  admin: SupabaseClient,
  tracker: SeedTracker,
): Promise<void> {
  const { petId, userId } = tracker;

  if (petId) {
    await admin.from("dog_brain_supplement_trials").delete().eq("pet_id", petId);
    await admin.from("dog_brain_followups").delete().eq("pet_id", petId);
    await admin.from("daily_health_logs").delete().eq("pet_id", petId);
    await admin.from("pets").delete().eq("id", petId);
  }
  // Always delete the auth user last (its rows cascade, but we already removed
  // them explicitly above for the residual proof).
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }

  // Prove 0 residual for the pet's rows (only meaningful once a pet existed).
  let residual = 0;
  if (petId) {
    for (const table of [
      "dog_brain_supplement_trials",
      "dog_brain_followups",
      "daily_health_logs",
    ]) {
      const { count } = await admin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("pet_id", petId);
      residual += count ?? 0;
    }
    const { count: petCount } = await admin
      .from("pets")
      .select("id", { count: "exact", head: true })
      .eq("id", petId);
    residual += petCount ?? 0;
  }
  if (residual !== 0) {
    throw new Error(`CLEANUP FAILED: ${residual} residual row(s) remain — manual purge required`);
  }
  console.log(
    `[e2e] cleanup OK — 0 residual rows (user=${userId ? "removed" : "n/a"}, pet=${petId ? "removed" : "n/a"})`,
  );
}

async function main() {
  const env = requireEnv();
  if (!env) {
    console.log(
      "[e2e] SKIP — required env missing (E2E_BASE_URL, SUPABASE_URL, " +
        "SUPABASE_SERVICE_ROLE_KEY, E2E_SANDBOX_EMAIL, E2E_SANDBOX_PASSWORD). No writes performed.",
    );
    process.exit(0);
  }
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The tracker is populated by seed() as each resource is created, so the
  // finally block can clean up even a half-finished seed (no orphaned user).
  const tracker: SeedTracker = {};
  const browser = await chromium.launch();
  try {
    const seeded = await seed(admin, env.email, env.password, tracker);
    console.log(`[e2e] seeded user=${seeded.userId} pet=${seeded.petId}`);

    const context = await browser.newContext();
    const page = await context.newPage();

    // Log in through the real UI to establish the session cookie.
    await page.goto(`${env.baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').first().fill(env.email);
    await page.locator('input[type="password"]').first().fill(env.password);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    await page.waitForLoadState("networkidle");

    // Trigger the Dog Brain loop with one authenticated daily-log POST so the
    // server materializes signals/follow-ups from the seeded history before the
    // symptom-checker turn reads them (matches the real owner flow).
    await context.request
      .post(`${env.baseUrl}/api/health-log`, {
        data: {
          pet_id: seeded.petId,
          appetite: "reduced",
          water: "normal",
          stool: "diarrhea",
          urination: "normal",
          vomiting_count: 1,
          energy: "low",
          meds_given: false,
          notes: "[e2e] today",
        },
        timeout: 60_000,
      })
      .catch(() => undefined);

    // Poll the symptom checker until a memory-driven question surfaces. The
    // current complaint wins first (Phase 1), so brain memory appears after the
    // complaint's own questions are exhausted — hence the multi-turn poll.
    // Complaint is about STOOL while the seeded memory's strongest recent
    // pattern is VOMITING — so the brain branch surfaces the memory-driven
    // vomiting question (with a trace) once the complaint's own questions run,
    // rather than the complaint itself owning every question.
    const messages: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: "He has loose stool again today and is off his food." },
    ];
    let memoryTrace: string | null = null;
    let session: unknown = undefined;
    for (let turn = 0; turn < MAX_MEMORY_TURNS; turn++) {
      const resp = await postSymptomChat(context.request, env.baseUrl, seeded.petId, messages, session);
      session = resp.session; // thread the engine state into the next turn
      const trace = resp.brain_question_trace?.evidence_summary;
      if (typeof trace === "string" && trace.length > 0) {
        memoryTrace = trace;
        break;
      }
      messages.push({ role: "assistant", content: resp.message ?? "(question)" });
      // Neutral, non-alarming answer that advances the flow without tripping an
      // unconfirmed critical-sign escalation (which would end the turn early).
      messages.push({ role: "user", content: "No blood, it's been about two days, otherwise he seems okay." });
    }
    if (!memoryTrace) {
      throw new Error(
        `ASSERTION FAILED: no brain_question_trace surfaced within ${MAX_MEMORY_TURNS} turns`,
      );
    }
    console.log(`[e2e] memory-driven question proven — trace: "${memoryTrace}"`);

    await page.goto(`${env.baseUrl}/symptom-checker`, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(ARTIFACT_DIR, "symptom-checker.png"), fullPage: true });

    // Emergency must SUPPRESS the trace.
    const emergency = await postSymptomChat(
      context.request,
      env.baseUrl,
      seeded.petId,
      [
        {
          role: "user",
          content: "He collapsed and is having a seizure that won't stop and his gums are pale.",
        },
      ],
      undefined, // standalone emergency turn — no prior session
    );
    const emergencyTrace = emergency.brain_question_trace?.evidence_summary;
    if (typeof emergencyTrace === "string" && emergencyTrace.length > 0) {
      throw new Error("ASSERTION FAILED: emergency turn did NOT suppress brain_question_trace");
    }
    console.log("[e2e] emergency path suppresses the trace — OK");

    writeFileSync(
      join(ARTIFACT_DIR, "result.json"),
      JSON.stringify({ memoryTrace, emergencyType: emergency.type, passed: true }, null, 2),
    );
    console.log("[e2e] PASS");
  } finally {
    // Clean up whatever exists — even a partial seed (only a user, only a pet).
    if (tracker.userId || tracker.petId) {
      await cleanup(admin, tracker);
    }
    await browser.close();
  }
}

// CLI entry only — never auto-run when imported by a unit test (which would
// otherwise try to launch a browser / hit the network with no env configured).
if (!process.env.JEST_WORKER_ID) {
  main().catch((err) => {
    console.error("[e2e] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
