"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, User, Heart, Check } from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  appendRedirectParam,
  buildCallbackUrl,
  getAuthFeedbackMessage,
  getAuthActionErrorMessage,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import { replaceWithBrowser } from "@/lib/browser-navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";

const EXPIRED_CONFIRMATION_ERRORS = new Set(["otp_expired", "confirm_link_expired"]);

const benefits = [
  "7-day free trial, no credit card required",
  "Dog symptom checker available 24/7",
  "Vet handoff summaries for symptom checks",
  "Cancel anytime — no questions asked",
];

export default function SignupPage() {
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const redirectTarget = resolvePostAuthRedirect(searchParams.get("redirect"));
  const urlError = searchParams.get("error");
  const hasExpiredLinkError =
    urlError !== null && EXPIRED_CONFIRMATION_ERRORS.has(urlError);
  const showResendButton = hasExpiredLinkError || Boolean(successMessage);
  const authFeedback = getAuthFeedbackMessage(
    searchParams.get("reason"),
    searchParams.get("error")
  );
  const feedbackClasses =
    authFeedback?.tone === "error"
      ? "bg-red-50 text-red-700"
      : "bg-honey-soft text-clay-deep";

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      if (!isSupabaseConfigured) {
        // Demo mode: skip auth and go to dashboard
        replaceWithBrowser(redirectTarget);
        return;
      }
      const signupResponse = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name,
          next: redirectTarget,
        }),
      });
      const signupPayload = (await signupResponse.json()) as {
        ok?: boolean;
        redirect?: string;
        message?: string;
      };

      if (!signupResponse.ok) {
        throw new Error(
          signupPayload.message ||
            "We couldn't create your account right now. Please try again."
        );
      }

      replaceWithBrowser(signupPayload.redirect || redirectTarget);
    } catch (err: unknown) {
      console.error("Failed to create account", err);
      const message = getAuthActionErrorMessage(
        err,
        "signup",
        "We couldn't create your account right now. Please try again."
      );
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyConfirmationCode = async () => {
    const trimmedEmail = email.trim();
    const trimmedCode = confirmationCode.trim();

    if (!trimmedEmail) {
      setError("Enter your email above to confirm your account.");
      return;
    }

    if (!trimmedCode) {
      setError("Enter the 6-digit confirmation code from your email.");
      return;
    }

    setVerifyLoading(true);
    setError("");

    try {
      if (!isSupabaseConfigured) {
        replaceWithBrowser(redirectTarget);
        return;
      }

      const verifyResponse = await fetch("/api/auth/verify-signup-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          token: trimmedCode,
          next: redirectTarget,
        }),
      });
      const verifyPayload = (await verifyResponse.json()) as {
        ok?: boolean;
        redirect?: string;
        message?: string;
      };

      if (!verifyResponse.ok) {
        throw new Error(
          verifyPayload.message ||
            "That confirmation code is invalid or has expired. Please resend the email and try again."
        );
      }

      replaceWithBrowser(verifyPayload.redirect || redirectTarget);
    } catch (err: unknown) {
      console.error("Failed to verify signup confirmation code", err);
      const message = getAuthActionErrorMessage(
        err,
        "signup",
        "That confirmation code is invalid or has expired. Please resend the email and try again."
      );
      setError(message);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email above to resend the confirmation link.");
      return;
    }

    setResendLoading(true);
    setError("");

    try {
      if (!isSupabaseConfigured) {
        setSuccessMessage(
          "Check your email to confirm your account and continue."
        );
        return;
      }

      const supabase = createClient();
      const emailRedirectTo = buildCallbackUrl(window.location.origin, redirectTarget);
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: trimmedEmail,
        options: { emailRedirectTo },
      });

      if (resendError) throw resendError;

      setSuccessMessage(
        "We sent another confirmation email. Enter the 6-digit code from that email below."
      );
    } catch (err: unknown) {
      console.error("Failed to resend confirmation email", err);
      const message = getAuthActionErrorMessage(
        err,
        "signup",
        "We couldn't resend the confirmation email right now. Please try again."
      );
      setError(message);
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <div className="grid w-full max-w-5xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
        {/* Left side - Benefits */}
        <div className="hidden lg:block">
          <h2 className="mb-4 font-display text-3xl font-semibold text-ink">
            Your dog deserves clearer next steps.
          </h2>
          <p className="mb-8 text-lg text-muted-warm">
            Start with dog-only symptom triage support and cleaner vet handoff
            notes.
          </p>
          <div className="space-y-4">
            {benefits.map((b) => (
              <div key={b} className="flex items-center gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-sage-soft">
                  <Check className="h-4 w-4 text-sage" />
                </span>
                <span className="text-ink/85">{b}</span>
              </div>
            ))}
          </div>
          <div className="mt-10 rounded-2xl border border-line bg-clay-soft p-6">
            <p className="font-display font-medium text-ink">
              &quot;PawVital helped me explain the symptom timeline to my vet and
              decide not to wait overnight.&quot;
            </p>
            <p className="mt-2 text-sm text-clay-deep">— Jessica R., Luna&apos;s owner</p>
          </div>
        </div>

        {/* Right side - Form */}
        <div>
          <div className="mb-8 text-center lg:text-left">
            <Link href="/" target="_top" prefetch={false} className="inline-flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-clay">
                <Heart className="h-6 w-6 fill-white text-white" />
              </span>
              <span className="font-display text-2xl font-semibold text-ink">PawVital</span>
            </Link>
            <h1 className="mt-6 font-display text-2xl font-semibold text-ink">Create your account</h1>
            <p className="mt-2 text-muted-warm">Start your 7-day free trial today</p>
          </div>

          <div className="rounded-3xl border border-line bg-paper p-8 shadow-[0_24px_70px_-50px_rgba(43,33,28,0.5)]">
            <form onSubmit={handleSignup} className="space-y-5">
              {authFeedback && !error && !successMessage && (
                <div className={`${feedbackClasses} rounded-xl p-3 text-sm`}>
                  {authFeedback.text}
                </div>
              )}
              {successMessage && (
                <div className="bg-sage-soft text-sage rounded-xl p-3 text-sm">
                  {successMessage}
                </div>
              )}
              {error && (
                <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">{error}</div>
              )}

              <Input
                label="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                icon={<User className="w-5 h-5" />}
                required
              />

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                icon={<Mail className="w-5 h-5" />}
                required
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                icon={<Lock className="w-5 h-5" />}
                required
                minLength={8}
              />

              <Button type="submit" variant="warm" loading={loading} className="w-full" size="lg">
                Start Free Trial
              </Button>

              {showResendButton && (
                <>
                  <p className="text-xs text-muted-warm text-center">
                    Email links can expire if opened by security scanners. Resend the
                    confirmation email, then enter the 6-digit code from the new email.
                    Do not click the link.
                  </p>
                  <Input
                    label="Confirmation code"
                    value={confirmationCode}
                    onChange={(e) => setConfirmationCode(e.target.value)}
                    placeholder="6-digit code"
                    icon={<Mail className="w-5 h-5" />}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                  <Button
                    type="button"
                    variant="warm"
                    loading={verifyLoading}
                    className="w-full"
                    size="lg"
                    onClick={() => void handleVerifyConfirmationCode()}
                  >
                    Confirm with code
                  </Button>
                  <Button
                    type="button"
                    variant="warmOutline"
                    loading={resendLoading}
                    className="w-full"
                    size="lg"
                    onClick={() => void handleResendConfirmation()}
                  >
                    Resend confirmation email
                  </Button>
                </>
              )}

              <p className="text-xs text-muted-warm text-center">
                By signing up, you agree to our Terms of Service and Privacy Policy.
              </p>
            </form>

            <div className="mt-6 text-center text-sm text-muted-warm">
              Already have an account?{" "}
              <a
                href={appendRedirectParam("/login", redirectTarget)}
                target="_top"
                className="font-semibold text-clay hover:text-clay-deep"
              >
                Sign in
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
