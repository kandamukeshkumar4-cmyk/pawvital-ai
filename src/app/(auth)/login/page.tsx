"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Heart } from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  appendRedirectParam,
  getAuthFeedbackMessage,
  getAuthActionErrorMessage,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
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
      : "bg-blue-50 text-blue-700";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!isSupabaseConfigured) {
        // Demo mode: skip auth and go to dashboard
        router.replace(redirectTarget);
        return;
      }
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;
      router.replace(redirectTarget);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Heart className="w-6 h-6 text-white fill-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">PawVital AI</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="mt-2 text-gray-600">
            Sign in to continue your dog&apos;s symptom checks and vet handoff
            summaries
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
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
                <input type="checkbox" className="rounded border-gray-300" />
                <span className="text-gray-600">Remember me</span>
              </label>
              <Link
                href={appendRedirectParam("/forgot-password", redirectTarget)}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Forgot password?
              </Link>
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Don&apos;t have an account?{" "}
            <Link
              href={appendRedirectParam("/signup", redirectTarget)}
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Start your free trial
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
