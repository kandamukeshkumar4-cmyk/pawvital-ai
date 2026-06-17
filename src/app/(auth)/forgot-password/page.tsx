"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, Heart, ArrowLeft } from "lucide-react";
import Button, { buttonClassName } from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  appendRedirectParam,
  buildRecoveryPageUrl,
  getAuthFeedbackMessage,
  getAuthActionErrorMessage,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import { createRecoveryClient, isSupabaseConfigured } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const redirectTarget = resolvePostAuthRedirect(searchParams.get("redirect"));
  const authFeedback = getAuthFeedbackMessage(
    searchParams.get("reason"),
    searchParams.get("error")
  );
  const feedbackClasses =
    authFeedback?.tone === "error"
      ? "bg-red-50 text-red-700"
      : "bg-honey-soft text-clay-deep";

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!isSupabaseConfigured) {
        // Demo mode: simulate success
        setSent(true);
        setLoading(false);
        return;
      }
      const supabase = createRecoveryClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: buildRecoveryPageUrl(window.location.origin, redirectTarget),
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err: unknown) {
      console.error("Failed to send reset email", err);
      const message = getAuthActionErrorMessage(
        err,
        "password_reset",
        "We couldn't send the reset email right now. Please try again."
      );
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
          <h1 className="mt-6 font-display text-2xl font-semibold text-ink">Reset your password</h1>
          <p className="mt-2 text-muted-warm">We&apos;ll send you a link to reset it</p>
        </div>

        <div className="rounded-3xl border border-line bg-paper p-8 shadow-[0_24px_70px_-50px_rgba(43,33,28,0.5)]">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage-soft">
                <Mail className="h-8 w-8 text-sage" />
              </div>
              <h2 className="mb-2 font-display text-xl font-semibold text-ink">Check your email</h2>
              <p className="mb-6 text-muted-warm">
                We&apos;ve sent a password reset link to <strong>{email}</strong>
              </p>
              <a
                href={appendRedirectParam("/login", redirectTarget)}
                target="_top"
                className={buttonClassName({
                  variant: "warmOutline",
                  className: "w-full",
                })}
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to login
              </a>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-5">
              {authFeedback && !error && (
                <div className={`${feedbackClasses} rounded-xl p-3 text-sm`}>
                  {authFeedback.text}
                </div>
              )}
              {error && (
                <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">{error}</div>
              )}
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                icon={<Mail className="w-5 h-5" />}
                required
              />
              <Button type="submit" variant="warm" loading={loading} className="w-full" size="lg">
                Send Reset Link
              </Button>
            </form>
          )}

          {!sent && (
            <div className="mt-6 text-center">
              <a
                href={appendRedirectParam("/login", redirectTarget)}
                target="_top"
                className="inline-flex items-center gap-1 text-sm font-medium text-clay hover:text-clay-deep"
              >
                <ArrowLeft className="w-4 h-4" /> Back to login
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
