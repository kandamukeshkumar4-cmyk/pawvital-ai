"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Heart, Lock } from "lucide-react";
import Button, { buttonClassName } from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  appendRedirectParam,
  buildLoginPath,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import { replaceWithBrowser } from "@/lib/browser-navigation";
import { createClient, createRecoveryClient, isSupabaseConfigured } from "@/lib/supabase";

const RECOVERY_SESSION_RETRY_MS = 150;
const RECOVERY_SESSION_RETRY_COUNT = 10;
type RecoverySessionSource = "cookie" | "implicit";

function hasRecoveryHash() {
  if (typeof window === "undefined") {
    return false;
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  return Boolean(hashParams.get("access_token") && hashParams.get("refresh_token"));
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState("");
  const recoverySessionSource = useRef<RecoverySessionSource>("cookie");
  const redirectTarget = resolvePostAuthRedirect(searchParams.get("redirect"));

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSessionReady(true);
      setCheckingSession(false);
      return;
    }

    const cookieSupabase = createClient();
    const implicitSupabase = createRecoveryClient();
    const shouldUseRecoveryHash = hasRecoveryHash();
    let selectedRecoverySessionSource: RecoverySessionSource | null = null;
    let mounted = true;

    function selectRecoverySessionSource(source: RecoverySessionSource) {
      selectedRecoverySessionSource = source;
      recoverySessionSource.current = source;
    }

    async function loadImplicitSession(shouldRetry: boolean) {
      for (
        let attempt = 0;
        attempt < (shouldRetry ? RECOVERY_SESSION_RETRY_COUNT : 1);
        attempt += 1
      ) {
        const {
          data: { session: currentSession },
        } = await implicitSupabase.auth.getSession();

        if (currentSession) {
          return currentSession;
        }

        if (attempt < RECOVERY_SESSION_RETRY_COUNT - 1) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, RECOVERY_SESSION_RETRY_MS);
          });
        }
      }

      return null;
    }

    async function loadSession() {
      let session = null;

      if (shouldUseRecoveryHash) {
        session = await loadImplicitSession(true);
        if (session) {
          selectRecoverySessionSource("implicit");
        }
      } else {
        const {
          data: { session: cookieSession },
        } = await cookieSupabase.auth.getSession();

        if (cookieSession) {
          session = cookieSession;
          selectRecoverySessionSource("cookie");
        }

        if (!session) {
          session = await loadImplicitSession(false);
          if (session) {
            selectRecoverySessionSource("implicit");
          }
        }
      }

      if (!mounted) {
        return;
      }

      setSessionReady(Boolean(session));
      setCheckingSession(false);

      if (!session) {
        setError("This password reset link is invalid or has expired.");
      }
    }

    function handleAuthStateChange(
      source: RecoverySessionSource,
      event: string,
      session: unknown
    ) {
      if (!mounted) {
        return;
      }

      if (shouldUseRecoveryHash && source === "cookie") {
        return;
      }

      if (
        !shouldUseRecoveryHash &&
        selectedRecoverySessionSource === "cookie" &&
        source === "implicit"
      ) {
        return;
      }

      if (
        event === "PASSWORD_RECOVERY" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        setSessionReady(Boolean(session));
        if (session) {
          selectRecoverySessionSource(source);
          setError("");
        }
      }

      if (event === "SIGNED_OUT" && !session) {
        setSessionReady(false);
      }
    }

    const {
      data: { subscription: cookieSubscription },
    } = cookieSupabase.auth.onAuthStateChange((event, session) => {
      handleAuthStateChange("cookie", event, session);
    });
    const {
      data: { subscription: implicitSubscription },
    } = implicitSupabase.auth.onAuthStateChange((event, session) => {
      handleAuthStateChange("implicit", event, session);
    });

    void loadSession();

    return () => {
      mounted = false;
      cookieSubscription.unsubscribe();
      implicitSubscription.unsubscribe();
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password.length < 8) {
      setLoading(false);
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setLoading(false);
      setError("Passwords do not match.");
      return;
    }

    try {
      if (!isSupabaseConfigured) {
        replaceWithBrowser(appendRedirectParam("/login", redirectTarget));
        return;
      }

      const supabase =
        recoverySessionSource.current === "cookie"
          ? createClient()
          : createRecoveryClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      replaceWithBrowser(
        buildLoginPath(redirectTarget, { reason: "password_updated" })
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update password";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" target="_top" prefetch={false} className="inline-flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-clay">
              <Heart className="h-6 w-6 fill-white text-white" />
            </span>
            <span className="font-display text-2xl font-semibold text-ink">PawVital</span>
          </Link>
          <h1 className="mt-6 font-display text-2xl font-semibold text-ink">Choose a new password</h1>
          <p className="mt-2 text-muted-warm">Use a strong password you haven&apos;t used before</p>
        </div>

        <div className="rounded-3xl border border-line bg-paper p-8 shadow-[0_24px_70px_-50px_rgba(43,33,28,0.5)]">
          {checkingSession ? (
            <p className="text-center text-sm text-muted-warm">Checking your reset link...</p>
          ) : sessionReady ? (
            <form onSubmit={handleReset} className="space-y-5">
              {error && (
                <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">{error}</div>
              )}

              <Input
                label="New Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                icon={<Lock className="w-5 h-5" />}
                required
                minLength={8}
              />

              <Input
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your new password"
                icon={<Lock className="w-5 h-5" />}
                required
                minLength={8}
              />

              <Button type="submit" variant="warm" loading={loading} className="w-full" size="lg">
                Update Password
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <div className="rounded-xl bg-honey-soft p-3 text-sm text-clay-deep">
                {error || "This password reset link is invalid or has expired."}
              </div>
              <a
                href={appendRedirectParam("/forgot-password", redirectTarget)}
                target="_top"
                className={buttonClassName({ variant: "warm", className: "w-full", size: "lg" })}
              >
                Request a New Reset Link
              </a>
            </div>
          )}

          <div className="mt-6 text-center">
            <a
              href={appendRedirectParam("/login", redirectTarget)}
              target="_top"
              className="inline-flex items-center gap-1 text-sm font-medium text-clay hover:text-clay-deep"
            >
              <ArrowLeft className="w-4 h-4" /> Back to login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
