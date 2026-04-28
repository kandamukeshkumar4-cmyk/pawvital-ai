"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Heart, Lock } from "lucide-react";
import Button, { buttonClassName } from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  appendRedirectParam,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import { replaceWithBrowser } from "@/lib/browser-navigation";
import { createRecoveryClient, isSupabaseConfigured } from "@/lib/supabase";

const RECOVERY_SESSION_RETRY_MS = 150;
const RECOVERY_SESSION_RETRY_COUNT = 10;

function hasRecoveryHash() {
  if (typeof window === "undefined") {
    return false;
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  return Boolean(
    hashParams.get("access_token") ||
      hashParams.get("refresh_token") ||
      hashParams.get("token_type")
  );
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState("");
  const redirectTarget = resolvePostAuthRedirect(searchParams.get("redirect"));

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSessionReady(true);
      setCheckingSession(false);
      return;
    }

    const supabase = createRecoveryClient();
    let mounted = true;

    async function loadSession() {
      const shouldRetry = hasRecoveryHash();
      let session = null;

      for (let attempt = 0; attempt < (shouldRetry ? RECOVERY_SESSION_RETRY_COUNT : 1); attempt += 1) {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        if (currentSession) {
          session = currentSession;
          break;
        }

        if (attempt < RECOVERY_SESSION_RETRY_COUNT - 1) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, RECOVERY_SESSION_RETRY_MS);
          });
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
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
          setError("");
        }
      }

      if (event === "SIGNED_OUT" && !session) {
        setSessionReady(false);
      }
    });

    void loadSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
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

      const supabase = createRecoveryClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      replaceWithBrowser(redirectTarget);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update password";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" target="_top" prefetch={false} className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Heart className="w-6 h-6 text-white fill-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">PawVital AI</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Choose a new password</h1>
          <p className="mt-2 text-gray-600">Use a strong password you haven&apos;t used before</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          {checkingSession ? (
            <p className="text-sm text-gray-600 text-center">Checking your reset link...</p>
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

              <Button type="submit" loading={loading} className="w-full" size="lg">
                Update Password
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <div className="bg-amber-50 text-amber-800 rounded-xl p-3 text-sm">
                {error || "This password reset link is invalid or has expired."}
              </div>
              <a
                href={appendRedirectParam("/forgot-password", redirectTarget)}
                target="_top"
                className={buttonClassName({ className: "w-full", size: "lg" })}
              >
                Request a New Reset Link
              </a>
            </div>
          )}

          <div className="mt-6 text-center">
            <a
              href={appendRedirectParam("/login", redirectTarget)}
              target="_top"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> Back to login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
