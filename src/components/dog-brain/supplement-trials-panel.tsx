"use client";

import { useCallback, useEffect, useState } from "react";
import { Pill, Plus, ShieldCheck } from "lucide-react";

/**
 * Persisted supplement trials (Dog Brain owned). Real DB-backed, not a mock:
 * lists trials via GET /api/dog-brain/supplements, starts an ask-vet trial via
 * POST (idempotent server-side), and records a terminal outcome via PATCH.
 *
 * Safety: this surface deliberately carries NO dosage / frequency / brand /
 * price. A trial is only a thing the owner is tracking to discuss with their
 * vet — never treatment advice. Mirrors FollowupsPanel's display+resolve model.
 */

export interface SupplementTrial {
  id: string;
  supplement_name: string;
  reason_signal_key: string | null;
  status: "ask_vet" | "active" | "stopped" | "follow_up_due" | "outcome_recorded";
  outcome: "better" | "same" | "worse" | "side_effect" | null;
  outcome_at: string | null;
  follow_up_due_at: string | null;
  created_at: string;
}

type Outcome = "better" | "same" | "worse" | "side_effect";

const STATUS_STYLE: Record<SupplementTrial["status"], { label: string; bg: string; fg: string }> = {
  ask_vet: { label: "Ask vet", bg: "#fdf3e3", fg: "#b5740a" },
  active: { label: "Active", bg: "#e9f6ef", fg: "#0b7a4d" },
  follow_up_due: { label: "Follow-up due", bg: "#fdf3e3", fg: "#b5740a" },
  outcome_recorded: { label: "Outcome recorded", bg: "#eef4fb", fg: "#4d7cb5" },
  stopped: { label: "Stopped", bg: "#f0f0ec", fg: "#85867e" },
};

const OUTCOMES: Outcome[] = ["better", "same", "worse", "side_effect"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface SupplementSuggestion {
  name: string;
  /** Optional signal that triggered this suggestion — preserved through to the DB trial. */
  reason_signal_key?: string | null;
}

export function SupplementTrialsPanel({
  petId,
  petName,
  suggestions = [],
}: {
  petId: string | null;
  petName: string;
  /** Supplement suggestions from the AI "ask vet" list — one-tap to track concretely. */
  suggestions?: SupplementSuggestion[];
}) {
  const [trials, setTrials] = useState<SupplementTrial[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!petId) return;
    try {
      const r = await fetch(`/api/dog-brain/supplements?pet_id=${petId}`);
      const j = (await r.json().catch(() => null)) as
        | { data?: SupplementTrial[]; code?: string }
        | null;
      if (j?.code === "TABLE_MISSING") {
        setError("Supplement tracking isn't set up yet.");
        setTrials([]);
        return;
      }
      setError(null);
      setTrials(Array.isArray(j?.data) ? j!.data : []);
    } catch {
      /* best-effort — leave existing list */
    }
  }, [petId]);

  useEffect(() => {
    let cancelled = false;
    if (!petId) {
      setTrials([]);
      return;
    }
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [petId, load]);

  const start = useCallback(
    async (supplementName: string, reasonSignalKey?: string | null) => {
      const trimmed = supplementName.trim();
      if (!petId || !trimmed || busy) return;
      setBusy(true);
      setError(null);
      try {
        const r = await fetch("/api/dog-brain/supplements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pet_id: petId,
            supplement_name: trimmed,
            reason_signal_key: reasonSignalKey ?? null,
          }),
        });
        if (!r.ok && r.status !== 200 && r.status !== 201) {
          setError("Couldn't track that right now.");
        } else {
          setName("");
          await load(); // re-read the real persisted list (POST is idempotent)
        }
      } catch {
        setError("Couldn't track that right now.");
      } finally {
        setBusy(false);
      }
    },
    [petId, busy, load],
  );

  const markActive = useCallback(
    async (id: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await fetch(`/api/dog-brain/supplements?id=${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_active" }),
        });
        if (!r.ok && r.status === 409) {
          // Guard fired: trial already past ask_vet — just refresh.
        }
        await load();
      } catch {
        /* best-effort */
      } finally {
        setBusy(false);
      }
    },
    [busy, load],
  );

  const recordOutcome = useCallback(
    async (id: string, outcome: Outcome) => {
      if (busy) return;
      setBusy(true);
      try {
        await fetch(`/api/dog-brain/supplements?id=${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome }),
        });
        await load(); // re-read so the terminal status is the real DB state
      } catch {
        /* best-effort */
      } finally {
        setBusy(false);
      }
    },
    [busy, load],
  );

  if (!petId) return null;

  // Suggestions the owner hasn't already started a trial for.
  const tracked = new Set(trials.map((t) => t.supplement_name.toLowerCase()));
  const seen = new Set<string>();
  const freshSuggestions = suggestions
    .filter((s) => {
      const key = s.name.toLowerCase();
      if (!s.name || tracked.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);

  return (
    <div style={{ background: "#fff", border: "1px solid #ebeae5", borderRadius: 14, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "#eaf3ee",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#0b7a4d",
            flex: "none",
          }}
        >
          <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1b" }}>Tracked supplement trials</div>
          <div style={{ fontSize: 12.5, color: "#85867e", marginTop: 2 }}>
            Saved to {petName}&apos;s record to discuss with your vet. We track the name and how it goes — never
            dosing or treatment advice.
          </div>
        </div>
      </div>

      {/* Start a trial */}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 120))}
          onKeyDown={(e) => {
            if (e.key === "Enter") void start(name);
          }}
          placeholder="Supplement to ask your vet about…"
          aria-label="Supplement name"
          style={{
            flex: 1,
            border: "1px solid #e6e5e0",
            borderRadius: 9,
            padding: "9px 12px",
            fontSize: 13.5,
            color: "#1d1d1b",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => void start(name)}
          disabled={busy || !name.trim()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "linear-gradient(180deg,#17a06d,#0a7048)",
            color: "#fff",
            border: "none",
            borderRadius: 9,
            padding: "9px 14px",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: busy || !name.trim() ? "default" : "pointer",
            opacity: busy || !name.trim() ? 0.55 : 1,
            fontFamily: "inherit",
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Track to ask vet
        </button>
      </div>

      {/* One-tap from AI "ask vet" suggestions → concrete persisted trial (reason_signal_key preserved) */}
      {freshSuggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 11 }}>
          <span style={{ fontSize: 12.5, color: "#9a9b93", alignSelf: "center" }}>From your plan:</span>
          {freshSuggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => void start(s.name, s.reason_signal_key)}
              disabled={busy}
              style={{
                background: "#f4f3ee",
                border: "1px solid #e6e5e0",
                color: "#3a3b34",
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: busy ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              + {s.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, fontSize: 13, color: "#b5740a" }}>{error}</div>
      )}

      {/* Real persisted trials */}
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 16 }}>
        {trials.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "#85867e" }}>
            <Pill className="h-4 w-4 text-[#c8c9c0]" aria-hidden />
            No tracked trials yet — add one above to discuss with your vet.
          </div>
        ) : (
          trials.map((t) => {
            const s = STATUS_STYLE[t.status] ?? STATUS_STYLE.ask_vet;
            const terminal = t.status === "outcome_recorded";
            return (
              <div
                key={t.id}
                style={{ border: "1px solid #efeee9", borderRadius: 11, background: "#fafaf7", padding: "13px 15px" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: "#1d1d1b" }}>{t.supplement_name}</div>
                  <span
                    style={{
                      background: s.bg,
                      color: s.fg,
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 13,
                      flex: "none",
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#9a9b93", marginTop: 3 }}>
                  {t.reason_signal_key ? `Reason: ${t.reason_signal_key.replace(/_/g, " ")} · ` : ""}
                  Added {formatDate(t.created_at)}
                </div>

                {terminal ? (
                  <div style={{ fontSize: 13, color: "#4d7cb5", fontWeight: 600, marginTop: 10 }}>
                    Outcome recorded: {t.outcome}
                  </div>
                ) : t.status === "ask_vet" ? (
                  // Lifecycle gate: owner must confirm with vet before starting.
                  <div style={{ marginTop: 11 }}>
                    <div style={{ fontSize: 12.5, color: "#b5740a", marginBottom: 8 }}>
                      Ask your vet about this supplement at your next visit.
                    </div>
                    <button
                      type="button"
                      onClick={() => void markActive(t.id)}
                      disabled={busy}
                      style={{
                        background: "linear-gradient(180deg,#17a06d,#0a7048)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 9,
                        padding: "7px 16px",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: busy ? "default" : "pointer",
                        opacity: busy ? 0.55 : 1,
                        fontFamily: "inherit",
                      }}
                    >
                      Vet approved — start trial
                    </button>
                  </div>
                ) : (
                  // active / follow_up_due: outcome recording
                  <div style={{ marginTop: 11 }}>
                    <div style={{ fontSize: 12.5, color: "#85867e", marginBottom: 7 }}>
                      How is {petName} doing on this?
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {OUTCOMES.map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => void recordOutcome(t.id, o)}
                          disabled={busy}
                          style={{
                            border: "1px solid #e3e2dd",
                            background: "#fff",
                            color: "#46473f",
                            borderRadius: 9,
                            padding: "6px 13px",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: busy ? "default" : "pointer",
                            textTransform: "capitalize",
                            fontFamily: "inherit",
                          }}
                        >
                          {o.replace(/_/g, " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
