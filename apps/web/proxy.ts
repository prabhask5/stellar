import { type NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";
import { AUTH_COOKIE } from "@/lib/server/supabase-cookie";

/**
 * Routing gate for pages (APIs enforce their own auth):
 *  - unconfigured        → everything goes to /setup
 *  - configured, no session cookie → /lock (PIN entry)
 *  - configured, signed in → /setup and /lock bounce back to the app
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
