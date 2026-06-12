"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, Heart } from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  appendRedirectParam,
  getAuthFeedbackMessage,
  getAuthActionErrorMessage,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import { replaceWithBrowser } from "@/lib/browser-navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!isSupabaseConfigured) {
        // Demo mode: skip auth and go to dashboard
        replaceWithBrowser(redirectTarget);
        return;
      }
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;
      replaceWithBrowser(redirectTarget);
    } catch (err: unknown) {
      console.error("Failed to sign in", err);
      const message = getAuthActionErrorMessage(
        err,
        "login",
        "We couldn't sign you in right now. Please try again."
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
          <h1 className="mt-6 font-display text-2xl font-semibold text-ink">Welcome back</h1>
          <p className="mt-2 text-muted-warm">
            Sign in to continue your dog&apos;s symptom checks and vet handoff
            summaries
          </p>
        </div>

        <div className="rounded-3xl border border-line bg-paper p-8 shadow-[0_24px_70px_-50px_rgba(43,33,28,0.5)]">
          <form onSubmit={handleLogin} className="space-y-5">
            {authFeedback && !error && (
              <div className={`${feedbackClasses} rounded-xl p-3 text-sm`}>
                {authFeedback.text}
              </div>
            )}
            {error && (
              <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">
                {error}
              </div>
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

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              icon={<Lock className="w-5 h-5" />}
              required
            />

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded border-line" />
                <span className="text-muted-warm">Remember me</span>
              </label>
              <a
                href={appendRedirectParam("/forgot-password", redirectTarget)}
                target="_top"
                className="font-medium text-clay hover:text-clay-deep"
              >
                Forgot password?
              </a>
            </div>

            <Button type="submit" variant="warm" loading={loading} className="w-full" size="lg">
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-warm">
            Don&apos;t have an account?{" "}
            <a
              href={appendRedirectParam("/signup", redirectTarget)}
              target="_top"
              className="font-semibold text-clay hover:text-clay-deep"
            >
              Start your free trial
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
