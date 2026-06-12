import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getServiceSupabase } from "@/lib/supabase-admin";
import {
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

async function findUserIdByEmail(
  admin: NonNullable<ReturnType<typeof getServiceSupabase>>,
  email: string
): Promise<string | null> {
  const normalized = email.toLowerCase();
  let page = 1;
  // Paginate defensively; small projects resolve on the first page.
  for (; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) return null;
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === normalized
    );
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function POST(request: NextRequest) {
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

    const admin = getServiceSupabase();
    if (!admin) {
      return NextResponse.json(
        {
          error: "server_misconfigured",
          message: "Signup is temporarily unavailable. Please try again later.",
        },
        { status: 500 }
      );
    }

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    let createErrorMessage: string | null = null;
    if (created.error) {
      const message = created.error.message.toLowerCase();
      const alreadyExists =
        message.includes("already") || created.error.status === 422;

      if (alreadyExists) {
        // Recover accounts stuck in the unconfirmed state from earlier
        // email-confirmation attempts: confirm them and reset the password
        // to what the user just typed only if sign-in fails below.
        const existingId = await findUserIdByEmail(admin, email);
        if (existingId) {
          const updated = await admin.auth.admin.updateUserById(existingId, {
            email_confirm: true,
          });
          if (updated.error) {
            createErrorMessage = updated.error.message;
          }
        } else {
          createErrorMessage = created.error.message;
        }
      } else {
        createErrorMessage = created.error.message;
      }
    }

    if (createErrorMessage) {
      return NextResponse.json(
        {
          error: "signup_failed",
          message:
            "We couldn't create your account. If you already have one, try signing in instead.",
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({ ok: true, redirect: nextTarget });
    const supabase = createRouteHandlerSupabaseClient(request, response);

    const signIn = await supabase.auth.signInWithPassword({ email, password });

    if (signIn.error) {
      // Account exists with a different password.
      return NextResponse.json(
        {
          error: "wrong_password",
          message:
            "An account with this email already exists. Sign in with your password, or reset it from the login page.",
        },
        { status: 400 }
      );
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
