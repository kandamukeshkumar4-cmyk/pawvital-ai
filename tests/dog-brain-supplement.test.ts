/**
 * Minimal tests for supplement trial persistence (backend support for Dog Brain).
 * No dosage text allowed in owner-facing paths.
 * Exercises the shipped route handler and migration file.
 */
import * as fs from 'fs';
import * as path from 'path';

describe("dog_brain_supplement_trials (minimal backend)", () => {
  it("migration file exists with required columns and RLS", () => {
    const migPath = path.resolve(__dirname, '../supabase/migrations/20260622000000_dog_brain_supplement_trials.sql');
    const sql = fs.readFileSync(migPath, 'utf8');
    expect(sql).toMatch(/dog_brain_supplement_trials/);
    expect(sql).toMatch(/user_id uuid/);
    expect(sql).toMatch(/RLS|ROW LEVEL SECURITY|POLICY/);
    expect(sql).toMatch(/follow_up_due_at/);
    // FK target must match the existing project auth/profile pattern used by
    // dog_brain_followups and vet_record_summaries (20260619 migration).
    expect(sql).toMatch(/REFERENCES public\.profiles\(id\)/);
    expect(sql).not.toMatch(/REFERENCES auth\.users/);
    // RLS enabled + owner-scoped policy + grants.
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/auth\.uid\(\) = user_id/);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE/);
    // Indexes support pet_id and follow_up_due_at loop queries.
    expect(sql).toMatch(/pet_id/);
    expect(sql).toMatch(/follow_up_due_at/);
    // Terminal answered status + its timestamp column.
    expect(sql).toMatch(/outcome_recorded/);
    expect(sql).toMatch(/outcome_at timestamptz/);
    // Partial unique index backstops idempotent trial starts (open trials only).
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*uniq_supplement_trial_open/);
    expect(sql).toMatch(/WHERE status IN \('ask_vet','active'\)/);
  });

  it("route and handler load (exercises shipped code, no dosage in guard)", async () => {
    const mod = await import('@/app/api/dog-brain/supplements/route');
    expect(typeof mod.POST).toBe('function');
    const routePath = path.resolve(__dirname, '../src/app/api/dog-brain/supplements/route.ts');
    const src = fs.readFileSync(routePath, 'utf8');
    expect(src).toMatch(/No dosage field allowed/);
    expect(src).toMatch(/supplement_name|follow_up_due_at/);
  });

  it("start supplement trial persists (exercises real POST handler + insert)", async () => {
    // Mock guards so the handler reaches the insert path without real auth/DB.
    jest.resetModules();
    jest.doMock('@/lib/api-auth', () => ({
      requireAuthenticatedApiUser: async () => ({ user: { id: 'user-1' } }),
    }));
    const capturedInserts: Array<Record<string, unknown>> = [];
    // Chainable stub: every filter returns itself; maybeSingle resolves `result`.
    const chain = (result: { data: unknown; error: unknown }) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) c[m] = () => c;
      c.maybeSingle = async () => result;
      return c;
    };
    jest.doMock('@/lib/api/pet-guard', () => ({
      requireOwnedPet: async () => ({
        user: { id: 'user-1' },
        petId: '11111111-1111-4111-8111-111111111111',
        supabase: {
          from: (table: string) => {
            if (table === 'dog_brain_supplement_trials') {
              return {
                // Idempotency pre-query: no existing open trial.
                select: () => chain({ data: null, error: null }),
                insert: (row: Record<string, unknown>) => {
                  capturedInserts.push(row);
                  return { select: () => ({ maybeSingle: async () => ({ data: { id: 'trial-1', ...row }, error: null }) }) };
                },
              };
            }
            // pets etc for ownership in route
            return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'pet-1' } }) }) }) }) };
          },
        },
      }),
    }));

    const mod = await import('@/app/api/dog-brain/supplements/route');
    const req = new Request('http://localhost/api/dog-brain/supplements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pet_id: '11111111-1111-4111-8111-111111111111',
        supplement_name: 'Fish Oil',
        reason_signal_key: 'energy_behavior_change',
      }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(201);
    expect(capturedInserts.length).toBe(1);
    expect(capturedInserts[0].supplement_name).toBe('Fish Oil');
    expect(capturedInserts[0].status).toBe('ask_vet');
    expect(capturedInserts[0].follow_up_due_at).toBeTruthy(); // required by plan
    // Lifecycle: an ask_vet trial has NOT started — started_at must stay null.
    expect(capturedInserts[0].started_at).toBeNull();
    // no dosage in the row we persisted
    expect(JSON.stringify(capturedInserts[0]).toLowerCase()).not.toMatch(/dose|dosage|mg|ml/);
  });

  it("duplicate POST returns existing open trial (deduped) and never inserts twice", async () => {
    jest.resetModules();
    const capturedInserts: Array<Record<string, unknown>> = [];
    const existingTrial = {
      id: 'trial-existing',
      supplement_name: 'Fish Oil',
      reason_signal_key: 'energy_behavior_change',
      status: 'ask_vet',
    };
    const chain = (result: { data: unknown; error: unknown }) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) c[m] = () => c;
      c.maybeSingle = async () => result;
      return c;
    };
    jest.doMock('@/lib/api/pet-guard', () => ({
      requireOwnedPet: async () => ({
        user: { id: 'user-1' },
        petId: '11111111-1111-4111-8111-111111111111',
        supabase: {
          from: (table: string) => {
            if (table === 'dog_brain_supplement_trials') {
              return {
                // Pre-query finds an existing OPEN trial → route must dedupe.
                select: () => chain({ data: existingTrial, error: null }),
                insert: (row: Record<string, unknown>) => {
                  capturedInserts.push(row);
                  return { select: () => ({ maybeSingle: async () => ({ data: { id: 'should-not-happen', ...row }, error: null }) }) };
                },
              };
            }
            return {};
          },
        },
      }),
    }));

    const mod = await import('@/app/api/dog-brain/supplements/route');
    const req = new Request('http://localhost/api/dog-brain/supplements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pet_id: '11111111-1111-4111-8111-111111111111',
        supplement_name: 'Fish Oil',
        reason_signal_key: 'energy_behavior_change',
      }),
    });
    const res = await mod.POST(req);
    const json = await res.json();
    expect(json.deduped).toBe(true);
    expect(json.data.id).toBe('trial-existing');
    expect(capturedInserts.length).toBe(0); // never inserted a duplicate
  });

  it("23505 race on insert is handled as dedupe, not a 500", async () => {
    jest.resetModules();
    const raced = { id: 'trial-raced', supplement_name: 'Fish Oil', status: 'ask_vet' };
    // Pre-query returns null (no existing); the dedupe re-fetch after 23505 returns the raced row.
    let selectCalls = 0;
    const chain = (result: { data: unknown; error: unknown }) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) c[m] = () => c;
      c.maybeSingle = async () => result;
      return c;
    };
    jest.doMock('@/lib/api/pet-guard', () => ({
      requireOwnedPet: async () => ({
        user: { id: 'user-1' },
        petId: '11111111-1111-4111-8111-111111111111',
        supabase: {
          from: (table: string) => {
            if (table === 'dog_brain_supplement_trials') {
              return {
                select: () => {
                  selectCalls += 1;
                  return chain(selectCalls === 1 ? { data: null, error: null } : { data: raced, error: null });
                },
                insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: '23505' } }) }) }),
              };
            }
            return {};
          },
        },
      }),
    }));

    const mod = await import('@/app/api/dog-brain/supplements/route');
    const req = new Request('http://localhost/api/dog-brain/supplements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pet_id: '11111111-1111-4111-8111-111111111111',
        supplement_name: 'Fish Oil',
      }),
    });
    const res = await mod.POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deduped).toBe(true);
    expect(json.data.id).toBe('trial-raced');
  });

  it("missing table on pre-query is reported honestly (503 TABLE_MISSING), not faked dedupe", async () => {
    jest.resetModules();
    const chain = (result: { data: unknown; error: unknown }) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) c[m] = () => c;
      c.maybeSingle = async () => result;
      return c;
    };
    jest.doMock('@/lib/api/pet-guard', () => ({
      requireOwnedPet: async () => ({
        user: { id: 'user-1' },
        petId: '11111111-1111-4111-8111-111111111111',
        supabase: {
          from: (table: string) => {
            if (table === 'dog_brain_supplement_trials') {
              return { select: () => chain({ data: null, error: { code: '42P01', message: 'relation does not exist' } }) };
            }
            return {};
          },
        },
      }),
    }));

    const mod = await import('@/app/api/dog-brain/supplements/route');
    const req = new Request('http://localhost/api/dog-brain/supplements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pet_id: '11111111-1111-4111-8111-111111111111',
        supplement_name: 'Fish Oil',
      }),
    });
    const res = await mod.POST(req);
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.code).toBe('TABLE_MISSING');
  });

  it("PATCH outcome persists better/same/worse/side_effect (no dosage)", async () => {
    jest.resetModules();
    const capturedUpdates: Array<Record<string, unknown>> = [];
    jest.doMock('@/lib/api-auth', () => ({
      requireAuthenticatedApiUser: async () => ({
        user: { id: 'user-1' },
        supabase: {
          from: (table: string) => {
            if (table === 'dog_brain_supplement_trials') {
              return {
                update: (fields: Record<string, unknown>) => {
                  capturedUpdates.push(fields);
                  return {
                    eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 't1', ...fields } }) }) }) }),
                  };
                },
              };
            }
            return {};
          },
        },
      }),
    }));

    const mod = await import('@/app/api/dog-brain/supplements/route');
    const req = new Request('http://localhost/api/dog-brain/supplements?id=11111111-1111-4111-8111-111111111111', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'worse', notes: 'got worse' }),
    });
    await mod.PATCH(req);
    expect(capturedUpdates.length).toBeGreaterThan(0);
    expect(capturedUpdates[0].outcome).toBe('worse');
    // Recording an outcome is terminal — it must NOT leave the trial looking due.
    expect(capturedUpdates[0].status).toBe('outcome_recorded');
    expect(capturedUpdates[0].status).not.toBe('follow_up_due');
    expect(capturedUpdates[0].outcome_at).toBeTruthy();
    expect(JSON.stringify(capturedUpdates[0]).toLowerCase()).not.toMatch(/dose|dosage|mg|ml/);
  });

  it("PATCH rejects a malformed (non-UUID) id with 400, not a 500", async () => {
    jest.resetModules();
    jest.doMock('@/lib/api-auth', () => ({
      requireAuthenticatedApiUser: async () => ({ user: { id: 'user-1' }, supabase: {} }),
    }));
    const mod = await import('@/app/api/dog-brain/supplements/route');
    const req = new Request('http://localhost/api/dog-brain/supplements?id=not-a-uuid', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'better' }),
    });
    const res = await mod.PATCH(req);
    expect(res.status).toBe(400);
  });

  it("unowned pet denied for supplement trial", async () => {
    jest.resetModules();
    jest.doMock('@/lib/api-auth', () => ({
      requireAuthenticatedApiUser: async () => ({ user: { id: 'user-1' } }),
    }));
    jest.doMock('@/lib/api/pet-guard', () => ({
      requireOwnedPet: async () => ({ response: { status: 404, json: async () => ({ error: 'Pet not found' }) } }),
    }));

    const mod = await import('@/app/api/dog-brain/supplements/route');
    const req = new Request('http://localhost/api/dog-brain/supplements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pet_id: '11111111-1111-4111-8111-999999999999', supplement_name: 'Bad' }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(404);
  });

  it("supplement trial outcome feeds into loadDogBrainContextWithSignals", async () => {
    jest.resetModules();
    // Provide minimal daily log so sections are built, plus the supplement outcome
    jest.doMock("@/lib/supabase-server", () => ({
      createServerSupabaseClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
        from: (table: string) => {
          if (table === "pets") {
            return { select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [{ id: "p1" }] }) }) }) }) };
          }
          if (table === "daily_health_logs") {
            return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [{ log_date: "2026-01-01", appetite: "normal", water: "normal", stool: "normal", urination: "normal", vomiting_count: 0, energy: "normal", meds_given: false }] }) }) }) }) }) };
          }
          if (table === "symptom_checks") {
            return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [{ id: 'c1', created_at: '2026-01-01', symptoms: 'cough', severity: 'watch' }] }) }) }) }) };
          }
          if (table === "dog_brain_supplement_trials") {
            return {
              select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [{ supplement_name: "Fish Oil", status: "active", outcome: "worse", follow_up_due_at: null }] }) }) }) }) }),
            };
          }
          // other tables empty
          return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) };
        },
      }),
    }));

    const { loadDogBrainContextWithSignals } = await import("@/lib/health-log/dog-brain-context");
    const ctx = await loadDogBrainContextWithSignals({ userId: "u1", petName: "Scout", petId: "p1" });
    const contextStr = ctx.context || '';
    expect(contextStr).toContain('Fish Oil');
    expect(contextStr).toContain('worse');
    // Strong proof that supplement 'worse' outcome appears in the output string of loadDogBrainContextWithSignals.
  });
});
