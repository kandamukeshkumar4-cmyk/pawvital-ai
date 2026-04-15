import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  buildLoginPath,
  buildRecoveryRedirectPath,
  DEFAULT_AUTH_REDIRECT,
  RESET_PASSWORD_PATH,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function buildFailureRedirect(
  request: NextRequest,
  redirectTarget: string,
  errorCode = "auth_callback_failed"
) {
  return NextResponse.redirect(
    new URL(
      buildLoginPath(redirectTarget, {
        error: errorCode,
      }),
      request.url
    )
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const rawNext = searchParams.get("next");
  const nextTarget = resolvePostAuthRedirect(rawNext, {
    allowedOrigin: origin,
    fallback: DEFAULT_AUTH_REDIRECT,
  });
  const recoveryTarget = resolvePostAuthRedirect(rawNext, {
    allowedOrigin: origin,
    fallback: buildRecoveryRedirectPath(DEFAULT_AUTH_REDIRECT),
    allowResetPassword: true,
  });

  try {
    const supabase = await createServerSupabaseClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return buildFailureRedirect(request, nextTarget);
      }
      return NextResponse.redirect(new URL(nextTarget, request.url));
    }

    if (tokenHash && rawType && OTP_TYPES.has(rawType as EmailOtpType)) {
      const type = rawType as EmailOtpType;
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (error) {
        const errorCode = type === "recovery" ? "invalid_reset_link" : "auth_callback_failed";
        return buildFailureRedirect(request, nextTarget, errorCode);
      }

      const redirectTarget =
        type === "recovery"
          ? recoveryTarget.startsWith(RESET_PASSWORD_PATH)
            ? recoveryTarget
            : buildRecoveryRedirectPath(recoveryTarget)
          : nextTarget;

      return NextResponse.redirect(new URL(redirectTarget, request.url));
    }
  } catch (error) {
    if (!(error instanceof Error && error.message === "DEMO_MODE")) {
      return buildFailureRedirect(request, nextTarget);
    }
  }

  return buildFailureRedirect(request, nextTarget);
}
