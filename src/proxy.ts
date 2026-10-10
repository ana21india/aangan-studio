import { NextResponse, type NextRequest } from "next/server";

// Quick first gate: no session cookie means straight to the login page.
// The real check (signature, expiry, admin still exists) happens on the server in requireAdmin().
export function proxy(request: NextRequest) {
  if (process.env.DASHBOARD_PUBLIC_DEMO === "true") return NextResponse.next(); // public demo mode
  if (!request.cookies.get("aangan_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
