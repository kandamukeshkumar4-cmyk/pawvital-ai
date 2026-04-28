"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, User, Heart, Check } from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  appendRedirectParam,
  buildBrowserCallbackUrl,
  getAuthFeedbackMessage,
  getAuthActionErrorMessage,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import { replaceWithBrowser } from "@/lib/browser-navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";

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
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const redirectTarget = resolvePostAuthRedirect(searchParams.get("redirect"));
  const authFeedback = getAuthFeedbackMessage(
    searchParams.get("reason"),
    searchParams.get("error")
  );
  const feedbackClasses =
    authFeedback?.tone === "error"
      ? "bg-red-50 text-red-700"
      : "bg-blue-50 text-blue-700";

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
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: buildBrowserCallbackUrl(window.location.origin, redirectTarget),
        },
      });

      if (authError) throw authError;

      if (data.session) {
        replaceWithBrowser(redirectTarget);
        return;
      }

      setSuccessMessage("Check your email to confirm your account and continue.");
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left side - Benefits */}
        <div className="hidden lg:block">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Your dog deserves clearer next steps.
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Start with dog-only symptom triage support and cleaner vet handoff
            notes.
          </p>
          <div className="space-y-4">
            {benefits.map((b) => (
              <div key={b} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-gray-700">{b}</span>
              </div>
            ))}
          </div>
          <div className="mt-10 bg-blue-50 rounded-2xl p-6 border border-blue-200">
            <p className="text-blue-800 font-medium">
              &quot;PawVital helped me explain the symptom timeline to my vet and
              decide not to wait overnight.&quot;
            </p>
            <p className="mt-2 text-blue-600 text-sm">— Jessica R., Luna&apos;s owner</p>
          </div>
        </div>

        {/* Right side - Form */}
        <div>
          <div className="text-center mb-8 lg:text-left">
            <Link href="/" target="_top" prefetch={false} className="inline-flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <Heart className="w-6 h-6 text-white fill-white" />
              </div>
              <span className="text-2xl font-bold text-gray-900">PawVital AI</span>
            </Link>
            <h1 className="mt-6 text-2xl font-bold text-gray-900">Create your account</h1>
            <p className="mt-2 text-gray-600">Start your 7-day free trial today</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            <form onSubmit={handleSignup} className="space-y-5">
              {authFeedback && !error && !successMessage && (
                <div className={`${feedbackClasses} rounded-xl p-3 text-sm`}>
                  {authFeedback.text}
                </div>
              )}
              {successMessage && (
                <div className="bg-green-50 text-green-700 rounded-xl p-3 text-sm">
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

              <Button type="submit" loading={loading} className="w-full" size="lg">
                Start Free Trial
              </Button>

              <p className="text-xs text-gray-500 text-center">
                By signing up, you agree to our Terms of Service and Privacy Policy.
              </p>
            </form>

            <div className="mt-6 text-center text-sm text-gray-600">
              Already have an account?{" "}
              <a
                href={appendRedirectParam("/login", redirectTarget)}
                target="_top"
                className="text-blue-600 hover:text-blue-700 font-semibold"
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
