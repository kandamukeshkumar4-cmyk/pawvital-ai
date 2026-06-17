"use client";

import { useEffect } from "react";
import {
  buildSignupPath,
  DEFAULT_AUTH_REDIRECT,
  sanitizeRedirectTarget,
} from "@/lib/auth-routing";
import { replaceWithBrowser } from "@/lib/browser-navigation";

const SIGNUP_LANDING_ERRORS = new Set(["otp_expired"]);
const AUTH_PAGE_PREFIXES = ["/login", "/signup"];

function shouldIgnoreCurrentPath(pathname: string) {
  return AUTH_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function resolveSafeRedirectTarget(url: URL) {
  return (
    sanitizeRedirectTarget(url.searchParams.get("redirect")) ||
    sanitizeRedirectTarget(url.searchParams.get("next")) ||
    DEFAULT_AUTH_REDIRECT
  );
}

function resolveSignupErrorCode(params: URLSearchParams): string | null {
  const errorCode = params.get("error_code");
  if (errorCode && SIGNUP_LANDING_ERRORS.has(errorCode)) {
    return errorCode;
  }

  const error = params.get("error");
  if (error && SIGNUP_LANDING_ERRORS.has(error)) {
    return error;
  }

  return null;
}

function buildSignupErrorRedirect(url: URL, errorCode: string) {
  if (!SIGNUP_LANDING_ERRORS.has(errorCode)) {
    return null;
  }

  const redirectTarget = resolveSafeRedirectTarget(url);
  return buildSignupPath(redirectTarget, { error: errorCode });
}

function buildQuerySignupErrorRedirect(url: URL) {
  const errorCode = resolveSignupErrorCode(url.searchParams);
  if (!errorCode) {
    return null;
  }

  return buildSignupErrorRedirect(url, errorCode);
}

function buildHashSignupErrorRedirect(url: URL) {
  const hash = url.hash;
  if (!hash) {
    return null;
  }

  const hashParams = new URLSearchParams(hash.slice(1));
  const errorCode = resolveSignupErrorCode(hashParams);
  if (!errorCode) {
    return null;
  }

  const redirectFromHash =
    sanitizeRedirectTarget(hashParams.get("redirect")) ||
    sanitizeRedirectTarget(hashParams.get("next"));
  const redirectTarget =
    redirectFromHash || resolveSafeRedirectTarget(url);

  return buildSignupPath(redirectTarget, { error: errorCode });
}

function getSignupErrorRedirectFromCurrentUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  if (shouldIgnoreCurrentPath(url.pathname)) {
    return null;
  }

  return buildQuerySignupErrorRedirect(url) || buildHashSignupErrorRedirect(url);
}

export default function AuthErrorRedirect() {
  useEffect(() => {
    const redirectPath = getSignupErrorRedirectFromCurrentUrl();
    if (!redirectPath) {
      return;
    }

    replaceWithBrowser(redirectPath);
  }, []);

  return null;
}
