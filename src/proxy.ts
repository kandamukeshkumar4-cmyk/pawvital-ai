import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_AUTH_REDIRECT,
  buildLoginPath,
  buildRedirectTarget,
  isAuthPagePath,
  isProtectedPath,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import {
  evaluatePrivateTesterAccess,
  isPrivateTesterModeEnabled,
  PRIVATE_TESTER_MODE_COOKIE,
} from "@/lib/private-tester-access";
import { isAdminIdentityUser } from "@/lib/admin-identity";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const isSupabaseConfigured =
  supabaseUrl.startsWith("http://") || supabaseUrl.startsWith("https://");

function applyPrivateTesterModeCookie(response: NextResponse) {
  if (isPrivateTesterModeEnabled(process.env)) {
    response.cookies.set(PRIVATE_TESTER_MODE_COOKIE, "1", {
      httpOnly: false,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  }

  response.cookies.set(PRIVATE_TESTER_MODE_COOKIE, "", {
    expires: new Date(0),
    httpOnly: false,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAdminRoute = pathname.startsWith("/admin");
  const isHomePage = pathname === "/";

  // Demo mode — no Supabase configured, allow everything through
  if (!isSupabaseConfigured) {
    return applyPrivateTesterModeCookie(NextResponse.next());
  }

  const isProtected = isProtectedPath(pathname);
  const isAuthPage = isAuthPagePath(pathname);

  if (!isProtected && !isAuthPage && !isHomePage) {
    return applyPrivateTesterModeCookie(NextResponse.next());
  }

  // Create Supabase client for middleware
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const requestedTarget = buildRedirectTarget(pathname, search);
  const redirectTarget = resolvePostAuthRedirect(
    request.nextUrl.searchParams.get("redirect"),
    {
      allowedOrigin: request.nextUrl.origin,
    }
  );
  const hadAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("-auth-token"));

  let user = null;
  let authError: Error | null = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    if (result.error) {
      authError = result.error;
    }
  } catch (error) {
    authError = error instanceof Error ? error : new Error("AUTH_LOOKUP_FAILED");
  }

  // Redirect unauthenticated users away from protected pages
  if (isProtected && !user) {
    const loginUrl = new URL(
      buildLoginPath(requestedTarget, {
        reason: authError || hadAuthCookie ? "session_expired" : undefined,
      }),
      request.url
    );
    return applyPrivateTesterModeCookie(NextResponse.redirect(loginUrl));
  }

  // Redirect authenticated users away from auth pages
  if (isAuthPage && user) {
    return applyPrivateTesterModeCookie(
      NextResponse.redirect(new URL(redirectTarget, request.url))
    );
  }

  const userEmail = typeof user?.email === "string" ? user.email : null;
  const isAdminUser = isAdminIdentityUser(user);

  if (isHomePage && user) {
    const testerAccess = evaluatePrivateTesterAccess({
      email: userEmail,
      pathname: DEFAULT_AUTH_REDIRECT,
    });

    if (testerAccess.allowed || isAdminUser) {
      return applyPrivateTesterModeCookie(
        NextResponse.redirect(new URL(DEFAULT_AUTH_REDIRECT, request.url))
      );
    }
  }

  if (isProtected && user && !isAdminRoute) {
    const testerAccess = evaluatePrivateTesterAccess({
      email: userEmail,
      pathname,
    });
    if (!testerAccess.allowed && !isAdminUser) {
      return applyPrivateTesterModeCookie(
        NextResponse.redirect(new URL("/", request.url))
      );
    }
  }

  return applyPrivateTesterModeCookie(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
