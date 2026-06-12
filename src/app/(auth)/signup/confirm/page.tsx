"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Button from "@/components/ui/button";
import {
  buildSignupConfirmCallbackUrl,
  buildSignupPath,
  DEFAULT_AUTH_REDIRECT,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import { replaceWithBrowser } from "@/lib/browser-navigation";

export default function SignupConfirmPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type") || "signup";
  const nextTarget = resolvePostAuthRedirect(searchParams.get("next"), {
    fallback: DEFAULT_AUTH_REDIRECT,
  });
  const callbackUrl = useMemo(() => {
    if (!tokenHash || typeof window === "undefined") {
      return null;
    }

    return buildSignupConfirmCallbackUrl(window.location.origin, nextTarget, {
      tokenHash,
      type: rawType,
    });
  }, [nextTarget, rawType, tokenHash]);

  const handleConfirm = () => {
    if (!callbackUrl) {
      setError("This confirmation link is missing required details. Please sign up again.");
      return;
    }

    replaceWithBrowser(callbackUrl);
  };

  if (!tokenHash) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-4">
        <div className="w-full max-w-md rounded-3xl border border-line bg-paper p-8 text-center shadow-[0_24px_70px_-50px_rgba(43,33,28,0.5)]">
          <h1 className="font-display text-2xl font-semibold text-ink">Link not ready</h1>
          <p className="mt-3 text-sm text-muted-warm">
            This confirmation link is incomplete. Request a new confirmation email from signup.
          </p>
          <Link
            href={buildSignupPath(nextTarget, { error: "confirm_link_expired" })}
            target="_top"
            prefetch={false}
            className="mt-6 inline-flex rounded-xl bg-clay px-5 py-3 text-sm font-semibold text-white hover:bg-clay-deep"
          >
            Back to signup
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-paper p-8 text-center shadow-[0_24px_70px_-50px_rgba(43,33,28,0.5)]">
        <h1 className="font-display text-2xl font-semibold text-ink">Confirm your email</h1>
        <p className="mt-3 text-sm text-muted-warm">
          Press the button below to finish creating your PawVital account. This extra step
          keeps email security scanners from using your link before you do.
        </p>
        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        <Button
          type="button"
          variant="warm"
          className="mt-6 w-full"
          size="lg"
          onClick={handleConfirm}
        >
          Confirm my email
        </Button>
        <p className="mt-4 text-xs text-muted-warm">
          Prefer a code instead? Use the 6-digit code on the signup page after resending your
          email.
        </p>
      </div>
    </div>
  );
}
