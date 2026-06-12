import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  buildSignupPath,
  DEFAULT_AUTH_REDIRECT,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";

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

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;

  try {
    const body = (await request.json()) as {
      email?: string;
      token?: string;
      next?: string | null;
    };
    const email = body.email?.trim() || "";
    const token = body.token?.trim() || "";
    const nextTarget = resolvePostAuthRedirect(body.next, {
      allowedOrigin: origin,
      fallback: DEFAULT_AUTH_REDIRECT,
    });

    if (!email || !token) {
      return NextResponse.json(
        { error: "missing_fields", message: "Email and confirmation code are required." },
        { status: 400 }
      );
    }

    const response = NextResponse.json({ ok: true, redirect: nextTarget });
    const supabase = createRouteHandlerSupabaseClient(request, response);

    const signupVerify = await supabase.auth.verifyOtp({
      email,
      token,
      type: "signup",
    });

    let data = signupVerify.data;
    let verifyError = signupVerify.error;

    if (verifyError) {
      const emailVerify = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      data = emailVerify.data;
      verifyError = emailVerify.error;
    }

    if (verifyError) {
      return NextResponse.json(
        {
          error: "invalid_code",
          message: verifyError.message,
          redirect: buildSignupPath(nextTarget, { error: "confirm_link_expired" }),
        },
        { status: 400 }
      );
    }

    if (!data.session) {
      return NextResponse.json(
        {
          error: "no_session",
          message: "Verification succeeded but no session was created.",
          redirect: buildSignupPath(nextTarget, { error: "auth_callback_failed" }),
        },
        { status: 500 }
      );
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json({ ok: true, redirect: DEFAULT_AUTH_REDIRECT });
    }

    return NextResponse.json(
      { error: "server_error", message: "Could not verify the confirmation code." },
      { status: 500 }
    );
  }
}
