"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import type { DetectedSignal } from "@/lib/dog-brain/types";

export interface Followup {
  id: string;
  signal_key: string;
  prompt: string;
  due_at: string | null;
}

/**
 * Durable Dog Brain follow-up loop, shared across surfaces (dashboard health
 * brief + Reminders queue). When `signals` are supplied it ensures a follow-up
 * exists for each active watch/alert pattern (idempotent server-side); it always
 * lists the pending follow-ups and lets the owner resolve better / same / worse
 * (PATCH feeds the outcome back into Brain memory). Renders nothing until there
 * is a pending item, so it is safe to drop onto any page.
 */
export function FollowupsPanel({
  petId,
  signals = [],
}: {
  petId: string | null;
  /** Omit on read-only surfaces (e.g. Reminders) to display + resolve without
   *  auto-creating follow-ups. */
  signals?: DetectedSignal[];
}) {
  const [items, setItems] = useState<Followup[]>([]);
  const signalKey = useMemo(
    () => signals.map((s) => `${s.signal_type}:${s.severity}`).join(","),
    [signals],
  );

  useEffect(() => {
    if (!petId) return;
    let cancelled = false;
    const actionable = signals.filter(
      (s) => s.severity === "watch" || s.severity === "alert",
    );
    (async () => {
      if (actionable.length > 0) {
        await Promise.allSettled(
          actionable.map((s) =>
            fetch("/api/dog-brain/followups", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pet_id: petId,
                signal_key: s.signal_type,
                prompt: `${s.owner_message} Is it better, the same, or worse today?`,
              }),
            }).catch(() => undefined),
          ),
        );
      }
      if (cancelled) return;
      try {
        const r = await fetch(`/api/dog-brain/followups?pet_id=${petId}`);
        const j = (await r.json().catch(() => null)) as { data?: Followup[] } | null;
        if (!cancelled) setItems(Array.isArray(j?.data) ? j!.data : []);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
    // signalKey makes the effect re-run only when the set of signals changes.
  }, [petId, signalKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolve = (id: string, status: "better" | "same" | "worse") => {
    setItems((prev) => prev.filter((f) => f.id !== id)); // optimistic
    void fetch(`/api/dog-brain/followups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => undefined);
  };

  if (items.length === 0) return null;

  return (
    <div
      className="rounded-[20px] bg-white p-5"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 18px rgba(0,0,0,.07)" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-[#0b7a4d]" aria-hidden />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6f7069]">
          Follow-ups due
        </p>
      </div>
      <ul className="space-y-3">
        {items.map((f) => (
          <li key={f.id} className="rounded-xl border border-[#ebeae5] bg-[#f9fbfa] p-3.5">
            <p className="text-[13px] leading-snug text-[#1d1d1b]">{f.prompt}</p>
            <div className="mt-2.5 flex gap-2">
              {(["better", "same", "worse"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => resolve(f.id, s)}
                  className="flex-1 rounded-lg border border-[#cfe6da] bg-white py-1.5 text-xs font-medium capitalize text-[#0b7a4d] transition-colors hover:border-[#0b7a4d] hover:bg-[#e9f6ef]"
                >
                  {s}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
