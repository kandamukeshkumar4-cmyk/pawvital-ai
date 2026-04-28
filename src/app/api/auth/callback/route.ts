import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  buildBrowserCallbackUrl,
  buildLoginPath,
  buildRecoveryRedirectPath,
  DEFAULT_AUTH_REDIRECT,
  RESET_PASSWORD_PATH,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";

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

function createRouteHandlerSupabaseClient(
  request: NextRequest,
  response: NextResponse
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("DEMO_MODE");
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const rawFlow = searchParams.get("flow");
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
    if (code) {
      const isRecoveryFlow =
        rawFlow === "recovery" ||
        rawType === "recovery" ||
        Boolean(rawNext?.includes(RESET_PASSWORD_PATH));
      const redirectTarget = isRecoveryFlow
        ? recoveryTarget.startsWith(RESET_PASSWORD_PATH)
          ? recoveryTarget
          : buildRecoveryRedirectPath(nextTarget)
        : nextTarget;

      if (isRecoveryFlow) {
        const browserCallbackUrl = new URL(
          buildBrowserCallbackUrl(origin, redirectTarget)
        );
        browserCallbackUrl.searchParams.set("code", code);
        browserCallbackUrl.searchParams.set("flow", "recovery");

        return NextResponse.redirect(browserCallbackUrl);
      }

      const response = NextResponse.redirect(
        new URL(redirectTarget, request.url)
      );
      const supabase = createRouteHandlerSupabaseClient(request, response);

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return buildFailureRedirect(request, nextTarget);
      }
      return response;
    }

    if (tokenHash && rawType && OTP_TYPES.has(rawType as EmailOtpType)) {
      const type = rawType as EmailOtpType;
      const redirectTarget =
        type === "recovery"
          ? recoveryTarget.startsWith(RESET_PASSWORD_PATH)
            ? recoveryTarget
            : buildRecoveryRedirectPath(recoveryTarget)
          : nextTarget;
      const response = NextResponse.redirect(
        new URL(redirectTarget, request.url)
      );
      const supabase = createRouteHandlerSupabaseClient(request, response);

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (error) {
        const errorCode =
          type === "recovery" ? "invalid_reset_link" : "auth_callback_failed";
        return buildFailureRedirect(request, nextTarget, errorCode);
      }

      return response;
    }
  } catch (error) {
    if (!(error instanceof Error && error.message === "DEMO_MODE")) {
      return buildFailureRedirect(request, nextTarget);
    }
  }

  return buildFailureRedirect(request, nextTarget);
}
