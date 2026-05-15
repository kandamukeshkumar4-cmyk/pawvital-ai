"use client";

import { useEffect } from "react";
import {
  buildRecoveryRedirectPath,
  RESET_PASSWORD_PATH,
  sanitizeRedirectTarget,
} from "@/lib/auth-routing";
import { replaceWithBrowser } from "@/lib/browser-navigation";
import { createRecoveryClient, isSupabaseConfigured } from "@/lib/supabase";

const AUTH_CALLBACK_PATH = "/api/auth/callback";
const BROWSER_CALLBACK_PATH = "/auth/callback";
const INTERNAL_BASE_URL = "https://pawvital.local";

interface RecoveryRedirectTarget {
  href: string;
  hydrateCurrentHash: boolean;
}

function isRecoveryFlow(value: string | null) {
  return value === "recovery";
}

function shouldIgnoreCurrentPath(pathname: string) {
  return (
    pathname.startsWith(RESET_PASSWORD_PATH) ||
    pathname.startsWith(AUTH_CALLBACK_PATH) ||
    pathname.startsWith(BROWSER_CALLBACK_PATH)
  );
}

function buildHashRecoveryRedirect(url: URL): RecoveryRedirectTarget | null {
  const hash = url.hash;
  if (!hash) {
    return null;
  }

  const hashParams = new URLSearchParams(hash.slice(1));
  const isRecoveryHash =
    isRecoveryFlow(hashParams.get("type")) &&
    Boolean(hashParams.get("access_token")) &&
    Boolean(hashParams.get("refresh_token"));

  if (!isRecoveryHash) {
    return null;
  }

  const redirectTarget =
    sanitizeRedirectTarget(url.searchParams.get("redirect")) ||
    sanitizeRedirectTarget(url.searchParams.get("next"));
  const recoveryPath = isResetPasswordRedirectTarget(redirectTarget)
    ? redirectTarget
    : buildRecoveryRedirectPath(redirectTarget);

  return {
    href: recoveryPath,
    hydrateCurrentHash: true,
  };
}

function buildQueryRecoveryRedirect(url: URL): RecoveryRedirectTarget | null {
  const flow = url.searchParams.get("flow") || url.searchParams.get("type");
  if (!isRecoveryFlow(flow)) {
    return null;
  }

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  if (!code && !tokenHash) {
    return null;
  }

  const redirectTarget =
    sanitizeRedirectTarget(url.searchParams.get("redirect")) ||
    sanitizeRedirectTarget(url.searchParams.get("next"));
  const callbackUrl = new URL(AUTH_CALLBACK_PATH, url.origin);

  if (code) {
    callbackUrl.searchParams.set("code", code);
  }

  if (tokenHash) {
    callbackUrl.searchParams.set("token_hash", tokenHash);
  }

  callbackUrl.searchParams.set("type", "recovery");
  callbackUrl.searchParams.set(
    "next",
    isResetPasswordRedirectTarget(redirectTarget)
      ? redirectTarget
      : buildRecoveryRedirectPath(redirectTarget)
  );

  return {
    href: `${callbackUrl.pathname}${callbackUrl.search}`,
    hydrateCurrentHash: false,
  };
}

function isResetPasswordRedirectTarget(target: string | null): target is string {
  if (!target) {
    return false;
  }

  try {
    return new URL(target, INTERNAL_BASE_URL).pathname === RESET_PASSWORD_PATH;
  } catch {
    return false;
  }
}

function getRecoveryRedirectFromCurrentUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  if (shouldIgnoreCurrentPath(url.pathname)) {
    return null;
  }

  return buildHashRecoveryRedirect(url) || buildQueryRecoveryRedirect(url);
}

export default function RecoveryRedirect() {
  useEffect(() => {
    const redirect = getRecoveryRedirectFromCurrentUrl();
    if (!redirect) {
      return;
    }

    async function completeRedirect() {
      if (redirect.hydrateCurrentHash && isSupabaseConfigured) {
        try {
          await createRecoveryClient().auth.getSession();
        } catch {
          // The reset page will show the invalid-link state if hydration fails.
        }
      }

      replaceWithBrowser(redirect.href);
    }

    void completeRedirect();
  }, []);

  return null;
}
