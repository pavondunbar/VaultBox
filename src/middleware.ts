import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCookieName, verifySessionToken } from "@/lib/auth/jwt";
import { getJwtSecret } from "@/lib/env";

const protectedPrefixes = ["/dashboard", "/wallet"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const start = Date.now();

  const isApi = pathname.startsWith("/api/");
  const needsAuth = protectedPrefixes.some((p) => pathname.startsWith(p));

  let userId: string | undefined;
  let secret: string;

  try {
    secret = getJwtSecret();
  } catch {
    if (needsAuth) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return logAndContinue(request, start, undefined);
  }

  const token = request.cookies.get(getCookieName())?.value;
  if (token) {
    const payload = await verifySessionToken(token, secret);
    if (payload) {
      userId = payload.sub;
    }
  }

  if (needsAuth && !userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isApi) {
    const response = NextResponse.next();
    const durationMs = Date.now() - start;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const userAgent = request.headers.get("user-agent") ?? "";
    console.log(
      JSON.stringify({
        type: "request",
        timestamp: new Date().toISOString(),
        method: request.method,
        path: pathname,
        durationMs,
        userId,
        ip,
        userAgent,
      }),
    );
    return response;
  }

  return NextResponse.next();
}

function logAndContinue(
  request: NextRequest,
  start: number,
  userId: string | undefined,
): NextResponse {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    const durationMs = Date.now() - start;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const userAgent = request.headers.get("user-agent") ?? "";
    console.log(
      JSON.stringify({
        type: "request",
        timestamp: new Date().toISOString(),
        method: request.method,
        path: pathname,
        durationMs,
        userId,
        ip,
        userAgent,
      }),
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/wallet/:path*",
    "/api/:path*",
  ],
};
