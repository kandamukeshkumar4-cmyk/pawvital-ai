import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildLoginPath,
  buildRedirectTarget,
  isAuthPagePath,
  isProtectedPath,
  resolvePostAuthRedirect,
} from "@/lib/auth-routing";
import { evaluatePrivateTesterAccess } from "@/lib/private-tester-access";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const isSupabaseConfigured =
  supabaseUrl.startsWith("http://") || supabaseUrl.startsWith("https://");

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Demo mode — no Supabase configured, allow everything through
  if (!isSupabaseConfigured) {
    return NextResponse.next();
  }

  const isProtected = isProtectedPath(pathname);
  const isAuthPage = isAuthPagePath(pathname);

  if (!isProtected && !isAuthPage) {
    return NextResponse.next();
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
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL(redirectTarget, request.url));
  }

  if (isProtected && user) {
    const testerAccess = evaluatePrivateTesterAccess({
      email: typeof user.email === "string" ? user.email : null,
      pathname,
    });
    if (!testerAccess.allowed) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
