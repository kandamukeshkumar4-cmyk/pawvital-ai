import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  DEFAULT_AUTH_REDIRECT,
  buildSignupCallbackUrl,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";

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

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
}

export async function POST(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request)
  );
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
        },
      }
    );
  }

  const origin = request.nextUrl.origin;

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
      next?: string | null;
    };
    const email = body.email?.trim() || "";
    const password = body.password || "";
    const name = body.name?.trim() || "";
    const nextTarget = resolvePostAuthRedirect(body.next, {
      allowedOrigin: origin,
      fallback: DEFAULT_AUTH_REDIRECT,
    });

    if (!email || !password) {
      return NextResponse.json(
        { error: "missing_fields", message: "Email and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          error: "weak_password",
          message: "Password must be at least 8 characters.",
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      ok: true,
      redirect: nextTarget,
      requiresConfirmation: false,
    });
    const supabase = createRouteHandlerSupabaseClient(request, response);
    const signup = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: buildSignupCallbackUrl(origin, nextTarget),
      },
    });

    if (signup.error) {
      return NextResponse.json(
        {
          error: "signup_failed",
          message:
            "We couldn't create your account. If you already have one, try signing in instead.",
        },
        { status: 400 }
      );
    }

    if (!signup.data?.session) {
      const confirmationResponse = NextResponse.json({
        ok: true,
        requiresConfirmation: true,
        message:
          "Check your email to confirm your account. You can resend the email and enter the 6-digit code here if the link expires.",
      });
      copyResponseCookies(response, confirmationResponse);
      return confirmationResponse;
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json({ ok: true, redirect: DEFAULT_AUTH_REDIRECT });
    }

    return NextResponse.json(
      {
        error: "server_error",
        message: "We couldn't create your account right now. Please try again.",
      },
      { status: 500 }
    );
  }
}
