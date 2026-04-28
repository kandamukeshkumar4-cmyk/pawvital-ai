"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  buildLoginPath,
  buildRecoveryRedirectPath,
  DEFAULT_AUTH_REDIRECT,
  RESET_PASSWORD_PATH,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import { replaceWithBrowser } from "@/lib/browser-navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const [error, setError] = useState<{
    actionHref: string;
    actionLabel: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      replaceWithBrowser(DEFAULT_AUTH_REDIRECT);
      return;
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const flow = url.searchParams.get("flow") || url.searchParams.get("type");
    const rawNext = url.searchParams.get("next");
    const nextTarget = resolvePostAuthRedirect(rawNext, {
      allowedOrigin: window.location.origin,
      fallback: DEFAULT_AUTH_REDIRECT,
    });
    const isRecoveryFlow =
      flow === "recovery" || Boolean(rawNext?.includes(RESET_PASSWORD_PATH));
    const explicitRecoveryTarget = resolvePostAuthRedirect(rawNext, {
      allowedOrigin: window.location.origin,
      fallback: buildRecoveryRedirectPath(DEFAULT_AUTH_REDIRECT),
      allowResetPassword: true,
    });
    const recoveryTarget = explicitRecoveryTarget.startsWith(RESET_PASSWORD_PATH)
      ? explicitRecoveryTarget
      : buildRecoveryRedirectPath(nextTarget);

    if (!code) {
      replaceWithBrowser(
        buildLoginPath(nextTarget, {
          error: "auth_callback_failed",
        })
      );
      return;
    }
    const authCode = code;

    async function completeCallback() {
      const supabase = createClient();
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(authCode);

      if (exchangeError) {
        replaceWithBrowser(
          buildLoginPath(nextTarget, {
            error: isRecoveryFlow ? "invalid_reset_link" : "auth_callback_failed",
          })
        );
        return;
      }

      replaceWithBrowser(isRecoveryFlow ? recoveryTarget : nextTarget);
    }

    void completeCallback().catch((err: unknown) => {
      console.error("Failed to complete auth callback", err);
      setError({
        actionHref: isRecoveryFlow
          ? "/forgot-password"
          : buildLoginPath(nextTarget, { error: "auth_callback_failed" }),
        actionLabel: isRecoveryFlow
          ? "Request a new reset link"
          : "Return to sign in",
        message: isRecoveryFlow
          ? "We couldn't complete password reset from that link. Please try again."
          : "We couldn't complete sign-in from that link. Please try again.",
      });
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-lg">
        {error ? (
          <>
            <h1 className="text-xl font-bold text-gray-900">Link not completed</h1>
            <p className="mt-3 text-sm text-gray-600">{error.message}</p>
            <Link
              href={error.actionHref}
              target="_top"
              prefetch={false}
              className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {error.actionLabel}
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-gray-900">Completing your secure link</h1>
            <p className="mt-3 text-sm text-gray-600">
              One moment while PawVital verifies this browser session.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
