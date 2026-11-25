import { type NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";
import { AUTH_COOKIE } from "@/lib/server/supabase-cookie";

/**
 * Routing gate for pages (APIs enforce their own auth):
 *  - unconfigured        → everything goes to /setup
 *  - configured, no session cookie → /lock (PIN entry)
 *  - configured, signed in → /setup and /lock bounce back to the app
 *  - /demo is always reachable; with the demo cookie the app pages are too
 * Only the presence of the session cookie is checked here, so navigation never
 * waits on the network; the data itself is protected by RLS.
 */
function isConfigured(): boolean {
  try {
    return getConfig().configured;
  } catch {
    // An unreadable config (wrong APP_SECRET) is explained by the setup page.
    return false;
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const configured = isConfigured();

  if (!configured) {
    return pathname === "/setup"
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/setup", req.url));
  }

  // The demo switch is public. It turns on a cookie that lets a visitor reach the app's
  // pages, which are static shells with no data in them; every API still requires the
  // owner's session, and in demo mode the client never calls one (lib/client/demo.ts).
  if (pathname === "/demo") return NextResponse.next();
  const demo = req.cookies.get("sp-demo")?.value === "1";
  if (demo) {
    // Signing in and setup are not part of the demo: leave it first.
    return pathname === "/lock" || pathname === "/setup"
      ? NextResponse.redirect(new URL("/demo", req.url))
      : NextResponse.next();
  }

  const signedIn = req.cookies
    .getAll()
    .some((c) => c.name === AUTH_COOKIE || c.name.startsWith(`${AUTH_COOKIE}.`));
  if (pathname === "/setup") {
    // The wizard's last steps (profile, done) run after sign-in.
    return signedIn && req.nextUrl.searchParams.has("step")
      ? NextResponse.next()
      : NextResponse.redirect(new URL(signedIn ? "/" : "/lock", req.url));
  }
  if (pathname === "/lock") {
    return signedIn ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (!signedIn) {
    const url = new URL("/lock", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: skip APIs, Next internals and static files (anything with an extension).
  matcher: ["/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
