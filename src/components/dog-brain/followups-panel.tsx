"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
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

  // Track the owner's selection per item so the chosen choice highlights before
  // the optimistic removal (matches the slide's selected-button styling).
  const [selected, setSelected] = useState<Record<string, "better" | "same" | "worse">>({});

  const resolve = (id: string, status: "better" | "same" | "worse") => {
    setSelected((prev) => ({ ...prev, [id]: status }));
    // Brief highlight, then optimistically remove the resolved item.
    window.setTimeout(() => {
      setItems((prev) => prev.filter((f) => f.id !== id));
    }, 180);
    void fetch(`/api/dog-brain/followups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => undefined);
  };

  if (items.length === 0) return null;

  return (
    <div
      className="rounded-[20px] bg-white"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 18px rgba(0,0,0,.07)", padding: "20px 24px" }}
    >
      <p className="mb-[4px] text-[11px] font-bold uppercase tracking-[0.7px] text-[#0b7a4d]">
        Follow-ups due
      </p>
      <p className="mb-4 text-[13.5px] text-[#85867e]">
        Help the Brain close the loop — your answers improve future alerts.
      </p>
      <div className="flex flex-col gap-[13px]">
        {items.map((f) => (
          <div key={f.id} className="rounded-[13px] border border-[#efeee9] bg-[#fafaf7]" style={{ padding: "14px 16px" }}>
            <div className="mb-[11px] flex items-start gap-[10px]">
              <span className="mt-[2px] flex text-[#6f7069]">
                <MessageCircleQuestion className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden />
              </span>
              <span className="flex-1 text-[14.5px] font-semibold leading-[1.35] text-[#1d1d1b]">
                {f.prompt}
              </span>
            </div>
            <div className="flex gap-2">
              {(["better", "same", "worse"] as const).map((s) => {
                const sel = selected[f.id] === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => resolve(f.id, s)}
                    className="rounded-[9px] px-[14px] py-[6px] text-[13px] font-semibold capitalize transition-colors"
                    style={{
                      border: `1px solid ${sel ? "#0b7a4d" : "#e3e2dd"}`,
                      background: sel ? "#e9f6ef" : "#fff",
                      color: sel ? "#0b7a4d" : "#46473f",
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
