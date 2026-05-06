import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "vencura_token";

export function getCookieName(): typeof COOKIE_NAME {
  return COOKIE_NAME;
}

export async function signSessionToken(
  payload: { sub: string; email: string },
  secret: string,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<{ sub: string; email: string } | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== "string" || typeof email !== "string") {
      return null;
    }
    return { sub, email };
  } catch {
    return null;
  }
}

export async function signTwoFactorToken(
  payload: { sub: string; email: string },
  secret: string,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ email: payload.email, purpose: "2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

export async function verifyTwoFactorToken(
  token: string,
  secret: string,
): Promise<{ sub: string; email: string } | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    if (payload.purpose !== "2fa") {
      return null;
    }
    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== "string" || typeof email !== "string") {
      return null;
    }
    return { sub, email };
  } catch {
    return null;
  }
}
