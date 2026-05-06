import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCookieName, verifySessionToken } from "@/lib/auth/jwt";
import { getJwtSecret } from "@/lib/env";

const protectedPrefixes = ["/dashboard", "/wallet"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = protectedPrefixes.some((p) => pathname.startsWith(p));
  if (!needsAuth) {
    return NextResponse.next();
  }

  let secret: string;
  try {
    secret = getJwtSecret();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const token = request.cookies.get(getCookieName())?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = await verifySessionToken(token, secret);
  if (!payload) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/wallet/:path*"],
};
