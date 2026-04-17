"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";
import { getPlanFromSubscription } from "@/lib/subscription-state";
import { useAppStore } from "@/store/app-store";
import type { SubscriptionPlanTier, SubscriptionRow } from "@/types";

interface SubscriptionContextValue {
  plan: SubscriptionPlanTier;
  subscription: SubscriptionRow | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

const DEFAULT_FREE: SubscriptionPlanTier = "free";

export function planRank(plan: SubscriptionPlanTier): number {
  switch (plan) {
    case "clinic":
      return 3;
    case "pro":
      return 2;
    case "free":
    default:
      return 1;
  }
}

export function planMeetsRequired(
  userPlan: SubscriptionPlanTier,
  required: "pro" | "clinic"
): boolean {
  if (required === "clinic") return userPlan === "clinic";
  return planRank(userPlan) >= planRank("pro");
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const user = useAppStore((s) => s.user);
  const userDataLoaded = useAppStore((s) => s.userDataLoaded);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !user?.id) {
      setSubscription(null);
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("Subscription fetch:", error.message);
        setSubscription(null);
        return;
      }
      setSubscription(data as SubscriptionRow | null);
    } catch (e) {
      console.warn("Subscription fetch failed:", e);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setSubscription(null);
      return;
    }

    if (!userDataLoaded) {
      setLoading(true);
      return;
    }

    if (!user?.id) {
      setLoading(false);
      setSubscription(null);
      return;
    }
    void refresh();
  }, [user?.id, userDataLoaded, refresh]);

  useEffect(() => {
    if (!userDataLoaded || !user?.id || !isSupabaseConfigured) {
      return;
    }

    const handleFocus = () => {
      void refresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh, user?.id, userDataLoaded]);

  const plan = useMemo((): SubscriptionPlanTier => {
    if (!isSupabaseConfigured) {
      return DEFAULT_FREE;
    }

    return getPlanFromSubscription(subscription);
  }, [subscription]);

  const value = useMemo(
    () => ({ plan, subscription, loading, refresh }),
    [plan, subscription, loading, refresh]
  );

  return (
    <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription must be used within SubscriptionProvider");
  }
  return ctx;
}

/** Safe for optional use outside provider (returns demo-style defaults). */
export function useSubscriptionOptional(): SubscriptionContextValue | null {
  return useContext(SubscriptionContext);
}
